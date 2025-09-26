<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class VendorController extends Controller
{

    use AuthorizesRequests;   // ← add this

    /**
     * GET /api/vendors
     * Supports:
     *  - q (search by name)
     *  - with=none (skip eager relations)
     *  - favorites=1 (only current user's favorited vendors)
     *  - lat,lng,radius_miles (nearby filtering via locations + vendor_locations or vendors.lat/lng)
     */
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 20);
        $q       = trim((string) $request->get('q', ''));

        $query = Vendor::query()->where('vendors.active', true);

        // Search by name
        if ($q !== '') {
            $query->where('vendors.name', 'like', "%{$q}%");
        }

        // Favorites (requires auth) – if not logged in, we simply don't filter
        if ($request->boolean('favorites')) {
            if ($user = $request->user()) {
                $favIds = $user->favoriteVendors()->pluck('vendors.id');
                $query->whereIn('vendors.id', $favIds);
            }
        }

        // Nearby filtering
        $lat = $request->get('lat');
        $lng = $request->get('lng');
        $rad = (float) $request->get('radius_miles', 10);
        $usingNearby = false;

        if (is_numeric($lat) && is_numeric($lng) && $rad > 0) {
            $lat = (float) $lat;
            $lng = (float) $lng;

            $hasLocations         = Schema::hasTable('locations')
                                     && Schema::hasColumn('locations', 'latitude')
                                     && Schema::hasColumn('locations', 'longitude');
            $hasVendorLocations   = Schema::hasTable('vendor_locations')
                                     && Schema::hasColumn('vendor_locations', 'vendor_id')
                                     && Schema::hasColumn('vendor_locations', 'location_id');

            $hasVendorLatLng      = Schema::hasColumn('vendors', 'latitude')
                                     && Schema::hasColumn('vendors', 'longitude');

            // Haversine (miles) expression factory
            $distExpr = function (string $latCol, string $lngCol): string {
                // Bindings order: [$lat, $lng, $lat]
                return '(3959 * acos( cos(radians(?)) * cos(radians(' . $latCol . ')) * cos(radians(' . $lngCol . ') - radians(?)) + sin(radians(?)) * sin(radians(' . $latCol . ')) ))';
            };

            if ($hasLocations && $hasVendorLocations) {
                // Join via pivot to locations; aggregate MIN(distance) per vendor (ONLY_FULL_GROUP_BY safe)
                $query
                    ->join('vendor_locations', 'vendor_locations.vendor_id', '=', 'vendors.id')
                    ->join('locations', 'locations.id', '=', 'vendor_locations.location_id')
                    ->whereNotNull('locations.latitude')
                    ->whereNotNull('locations.longitude')
                    ->select('vendors.*')
                    ->selectRaw(
                        'MIN(' . $distExpr('locations.latitude', 'locations.longitude') . ') AS distance_miles',
                        [$lat, $lng, $lat]
                    )
                    ->groupBy('vendors.id')
                    ->having('distance_miles', '<=', $rad)
                    ->orderBy('distance_miles', 'asc');

                $usingNearby = true;

            } elseif ($hasVendorLatLng) {
                // Distance directly from vendors table (no join, one row per vendor)
                $query
                    ->whereNotNull('vendors.latitude')
                    ->whereNotNull('vendors.longitude')
                    ->select('vendors.*')
                    ->selectRaw(
                        $distExpr('vendors.latitude', 'vendors.longitude') . ' AS distance_miles',
                        [$lat, $lng, $lat]
                    )
                    ->having('distance_miles', '<=', $rad)
                    ->orderBy('distance_miles', 'asc');

                $usingNearby = true;
            }
            // else: no geodata; leave as name-ordered below
        }

        // Eager load relations unless with=none
        if ($request->get('with') === 'none') {
            if (!$usingNearby) {
                $query->orderBy('vendors.name');
            }
            $vendors = $query->paginate($perPage);
        } else {
            if (!$usingNearby) {
                $query->orderBy('vendors.name');
            }
            $vendors = $query
                ->with([
                    'products' => function ($q) {
                        $q->where('products.active', true)
                          ->with(['variants' => function ($v) {
                              $v->where('product_variants.active', true)
                                ->select([
                                    'product_variants.id',
                                    'product_variants.product_id',
                                    'product_variants.name',
                                    'product_variants.sku',
                                    'product_variants.price_cents',
                                    'product_variants.active',
                                ]);
                          }]);
                    },
                    'locations',
                ])
                ->paginate($perPage);
        }

        return response()->json($vendors);
    }

    /**
     * GET /api/vendors/{vendor}
     * Returns vendor plus can_edit flag. Products/locations are included unless with=none.
     */
    public function show(Vendor $vendor, Request $request)
    {
        if (!$vendor->active) {
            return response()->json(['message' => 'Vendor not active'], 404);
        }

        if ($request->get('with') !== 'none') {
            $vendor->load([
                'products' => function ($q) {
                    $q->where('products.active', true)
                      ->with(['variants' => function ($v) {
                          $v->where('product_variants.active', true)
                            ->select([
                                'product_variants.id',
                                'product_variants.product_id',
                                'product_variants.name',
                                'product_variants.sku',
                                'product_variants.price_cents',
                                'product_variants.active',
                            ]);
                      }]);
                },
                'locations',
            ]);
        }

        // Resolve user optionally from bearer token (route is public)
        $user = $request->user();
        if (!$user && ($token = $request->bearerToken())) {
            if ($pat = PersonalAccessToken::findToken($token)) {
                $user = $pat->tokenable;
            }
        }

        $canEdit = $user ? $user->can('update', $vendor) : false;

        return response()->json(array_merge($vendor->toArray(), [
            'can_edit' => $canEdit,
        ]));
    }

    /**
     * GET /api/my/vendors
     * Vendors the current user is attached to (via vendor_users).
     * Accepts: q, with=none, per_page
     */
    public function myVendors(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $perPage = (int) $request->integer('per_page', 20);
        $q       = trim((string) $request->get('q', ''));

        // IDs from pivot
        $ids = DB::table('vendor_users')
            ->where('user_id', $user->id)
            ->pluck('vendor_id');

        $query = Vendor::query()
            ->whereIn('vendors.id', $ids)
            ->where('vendors.active', true);

        if ($q !== '') {
            $query->where('vendors.name', 'like', "%{$q}%");
        }

        if ($request->get('with') === 'none') {
            $vendors = $query->orderBy('vendors.name')->paginate($perPage);
        } else {
            $vendors = $query
                ->with([
                    'products' => function ($q) {
                        $q->where('products.active', true)
                          ->with(['variants' => function ($v) {
                              $v->where('product_variants.active', true)
                                ->select([
                                    'product_variants.id',
                                    'product_variants.product_id',
                                    'product_variants.name',
                                    'product_variants.sku',
                                    'product_variants.price_cents',
                                    'product_variants.active',
                                ]);
                          }]);
                    },
                    'locations',
                ])
                ->orderBy('vendors.name')
                ->paginate($perPage);
        }

        return response()->json($vendors);
    }

    public function update(\App\Models\Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        // 1) Validate vendor fields + address fields
        $data = $request->validate([
            'name'          => ['sometimes','string','max:255'],
            'description'   => ['sometimes','nullable','string','max:10000'],
            'flyer_text'    => ['sometimes','nullable','string','max:10000'],
            'contact_email' => ['sometimes','nullable','string','max:255'],
            'contact_phone' => ['sometimes','nullable','string','max:64'],

            // Address fields (stored on a Location linked via vendor_locations)
            'address_line1' => ['sometimes','nullable','string','max:255'],
            'address_line2' => ['sometimes','nullable','string','max:255'],
            'city'          => ['sometimes','nullable','string','max:128'],
            'region'        => ['sometimes','nullable','string','max:128'],
            'postal_code'   => ['sometimes','nullable','string','max:32'],
            'country'       => ['sometimes','nullable','string','max:2'],
        ]);

        // 2) Update vendor basics
        $vendor->fill(array_intersect_key($data, array_flip([
            'name','description','flyer_text','contact_email','contact_phone'
        ])))->save();

        // 3) Upsert "Primary" location and geocode if needed
        $addrKeys = ['address_line1','address_line2','city','region','postal_code','country'];
        $hasAddrInput = (bool) array_intersect($addrKeys, array_keys($data));

        if ($hasAddrInput) {
            // Find an existing "Primary" location or the first linked location; else make a new one
            $loc = $vendor->locations()->orderBy('id')->first();

            if (!$loc) {
                $loc = new \App\Models\Location();
                $loc->label = 'Primary';
            }

            // Detect if address changed
            $before = implode('|', [
                $loc->address_line1, $loc->address_line2, $loc->city,
                $loc->region, $loc->postal_code, $loc->country
            ]);

            foreach ($addrKeys as $k) {
                if (array_key_exists($k, $data)) {
                    $loc->{$k} = $data[$k] ?? null;
                }
            }

            $after = implode('|', [
                $loc->address_line1, $loc->address_line2, $loc->city,
                $loc->region, $loc->postal_code, $loc->country
            ]);

            $addressChanged = ($before !== $after);

            // Geocode if changed or missing lat/lng
            if ($addressChanged || !$loc->latitude || !$loc->longitude) {
                if (trim((string)$loc->address_line1) || trim((string)$loc->city) || trim((string)$loc->postal_code)) {
                    $geo = \App\Services\Geocoding::geocode([
                        'address_line1' => $loc->address_line1,
                        'address_line2' => $loc->address_line2,
                        'city'          => $loc->city,
                        'region'        => $loc->region,
                        'postal_code'   => $loc->postal_code,
                        'country'       => $loc->country,
                    ]);
                    if ($geo) {
                        $loc->latitude  = $geo['lat'];
                        $loc->longitude = $geo['lng'];
                    }
                }
            }

            $loc->save();

            // Ensure linked
            if (!$vendor->locations()->where('locations.id', $loc->id)->exists()) {
                $vendor->locations()->attach($loc->id);
            }
        }

        // Reload with relations for the frontend
        $vendor->load([
            'products' => function ($q) {
                $q->where('products.active', true)
                ->with(['variants' => function ($v) {
                    $v->where('product_variants.active', true)
                        ->select([
                            'product_variants.id',
                            'product_variants.product_id',
                            'product_variants.name',
                            'product_variants.sku',
                            'product_variants.price_cents',
                            'product_variants.active',
                        ]);
                }]);
            },
            'locations',
        ]);
        return response()->json($vendor);
    }

}