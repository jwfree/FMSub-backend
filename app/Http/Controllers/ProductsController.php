<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use App\Support\AvailabilityQueries;

class ProductsController extends Controller
{
    use AvailabilityQueries;

    /**
     * GET /api/products
     *
     * availability (server-side):
     *  - in_or_out_with_waitlist (default): in-stock OR (out-of-stock AND allow_waitlist)
     *  - in_only
     *  - out_any
     *  - out_with_waitlist
     *  - both (no filtering)
     *
     * Other params:
     *  - q
     *  - vendor_id (legacy single)
     *  - vendor_ids=1,2,3
     *  - favorites=1 (by favorite vendors of auth user)
     *  - date=YYYY-MM-DD
     *  - location_id
     *  - per_page
     *  - order_by (name|price|distance)  // preserved; default sort by name
     */
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 20);
        $q       = trim((string) $request->get('q', ''));

        // Vendor filters
        $vendorIds = [];
        $legacyVendorId = $request->get('vendor_id');
        if ($legacyVendorId) $vendorIds[] = (int) $legacyVendorId;

        $csv = trim((string) $request->get('vendor_ids', ''));
        if ($csv !== '') {
            foreach (explode(',', $csv) as $v) {
                $n = (int) trim($v);
                if ($n > 0) $vendorIds[] = $n;
            }
        }
        $vendorIds = array_values(array_unique($vendorIds));

        $favorites = (bool) $request->boolean('favorites', false);
        $user      = $request->user();

        // Availability/date/location
        $dateStr    = (string) $request->get('date', Carbon::today()->toDateString());
        $date       = Carbon::parse($dateStr)->toDateString();
        $locationId = $request->integer('location_id') ?: null;

        $availability = strtolower((string) $request->get('availability', 'in_or_out_with_waitlist'));
        $availability = match ($availability) {
            'in'  => 'in_only',
            'out' => 'out_any',
            default => $availability,
        };
        if (!in_array($availability, [
            'in_only',
            'out_any',
            'out_with_waitlist',
            'in_or_out_with_waitlist',
            'both'
        ], true)) {
            $availability = 'in_or_out_with_waitlist';
        }

        // Build per-product availability rollup (from trait)
        $productAvail = $this->buildProductAvailabilityRollup($vendorIds, $date, $locationId);

        $query = Product::query()
            ->where('products.active', true)
            ->whereHas('vendor', fn ($v) => $v->where('active', true))
            // search
            ->when($q !== '', function ($qb) use ($q) {
                $qb->where(function ($w) use ($q) {
                    $w->where('products.name', 'like', "%{$q}%")
                      ->orWhere('products.description', 'like', "%{$q}%");
                });
            })
            // vendor filters
            ->when(count($vendorIds) > 0, fn ($qb) => $qb->whereIn('products.vendor_id', $vendorIds))
            ->when($legacyVendorId && count($vendorIds) === 0, fn ($qb) => $qb->where('products.vendor_id', $legacyVendorId))
            // favorites (by vendor)
            ->when($favorites && $user, function ($qb) use ($user) {
                $favVendorIds = $user->favoriteVendors()->pluck('vendors.id')->all();
                $qb->whereIn('products.vendor_id', !empty($favVendorIds) ? $favVendorIds : [-1]);
            })
            // join availability
            ->leftJoinSub($productAvail, 'PA', 'PA.product_id', '=', 'products.id')
            // select + exposed availability metrics
            ->select([
                'products.*',
                DB::raw('products.id as product_id'),
                DB::raw('COALESCE(PA.any_available, 0) as any_available'),
                DB::raw('COALESCE(PA.available_qty_sum, 0) as available_qty'),
            ])
            // availability filter (server-side)
            ->when($availability !== 'both', function ($qb) use ($availability) {
                $qb->where(function ($w) use ($availability) {
                    if ($availability === 'in_only') {
                        $w->where('PA.any_available', 1);
                    } elseif ($availability === 'out_any') {
                        $w->where(function ($q) {
                            $q->whereNull('PA.any_available')
                              ->orWhere('PA.any_available', 0);
                        });
                    } elseif ($availability === 'out_with_waitlist') {
                        $w->where(function ($q) {
                            $q->where(function ($x) {
                                $x->whereNull('PA.any_available')
                                  ->orWhere('PA.any_available', 0);
                            })
                            ->where('products.allow_waitlist', true);
                        });
                    } elseif ($availability === 'in_or_out_with_waitlist') {
                        $w->where(function ($q) {
                            $q->where('PA.any_available', 1)
                              ->orWhere(function ($x) {
                                  $x->where(function ($z) {
                                      $z->whereNull('PA.any_available')
                                        ->orWhere('PA.any_available', 0);
                                  })
                                  ->where('products.allow_waitlist', true);
                              });
                        });
                    }
                });
            })
            // eager loads
            ->with([
                'vendor:id,name',
                'variants' => function ($v) {
                    $v->where('active', true)
                      ->select('id','product_id','name','sku','price_cents','active');
                },
            ])
            ->orderBy('products.name');

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /api/products/{product}
     */
    public function show(Product $product)
    {
        // Only allow active product + vendor
        if (!$product->active || !$product->vendor?->active) {
            return response()->json(['message' => 'Product not available'], 404);
        }

        $product->load([
            'vendor:id,name',
            'variants' => function ($q) {
                $q->where('active', true)
                  ->select('id','product_id','name','sku','price_cents','active');
            },
        ]);

        return response()->json($product);
    }

    /**
     * GET /api/vendors/{vendor}/products
     * Optional query params:
     *   - q=...                 (search name/description)
     *   - include_inactive=1    (include inactive products/variants)
     *   - per_page=50 | all
     */
    public function byVendor(Request $request, Vendor $vendor)
    {
        $perPage         = $request->get('per_page', 50);
        $search          = trim((string) $request->get('q', ''));
        $includeInactive = (bool) $request->boolean('include_inactive', false);

        $query = $vendor->products()
            ->with(['variants' => function ($q) use ($includeInactive) {
                if (!$includeInactive) {
                    $q->where('active', true);
                }
                $q->orderBy('sort_order')->orderBy('name');
            }]);

        if (!$includeInactive) {
            $query->where('active', true);
        }

        if ($search !== '') {
            $query->where(function ($w) use ($search) {
                $w->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $query->orderBy('name');

        // allow per_page=all to return a plain array
        if ($perPage === 'all' || (int) $perPage === 0) {
            return response()->json($query->get());
        }

        return response()->json($query->paginate((int) $perPage));
    }
}