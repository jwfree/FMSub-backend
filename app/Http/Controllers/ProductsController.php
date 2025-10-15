<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Vendor;
use App\Models\InventoryEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class ProductsController extends Controller
{
    /**
     * Build a per-product availability rollup subquery.
     * - Mirrors InventoryController@index rules for ledger window:
     *     for_date <= :date AND (shelf_life_days IS NULL OR for_date >= DATE_SUB(:date, INTERVAL shelf_life_days DAY))
     * - reserved: deliveries for :date with status in [scheduled, ready]
     * - available per variant = manual - reserved
     * - roll up to product:
     *     any_available = MAX(available_qty > 0)
     *     available_qty = SUM(GREATEST(available_qty, 0))
     */
    protected function buildProductAvailabilityRollup(array $vendorIds, string $date, ?int $locationId = null)
    {
        $entriesTable = (new InventoryEntry())->getTable();

        // --- Ledger (manual) up to $date with shelf-life window
        $ledgerSub = DB::table("$entriesTable as ie")
            ->select('ie.product_variant_id', DB::raw('SUM(ie.qty) as manual_qty'))
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('ie.vendor_id', $vendorIds))
            ->when($locationId, fn ($q) => $q->where('ie.vendor_location_id', $locationId))
            ->whereDate('ie.for_date', '<=', $date)
            ->where(function ($q) use ($date) {
                // Same window used in InventoryController
                $q->whereNull('ie.shelf_life_days')
                  ->orWhereRaw('DATE(ie.for_date) >= DATE_SUB(?, INTERVAL ie.shelf_life_days DAY)', [$date]);
            })
            ->groupBy('ie.product_variant_id');

        // --- Reserved from deliveries (same day)
        $reservedSub = DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->select('s.product_variant_id', DB::raw('SUM(d.qty) as reserved_qty'))
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('s.vendor_id', $vendorIds))
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->whereDate('d.scheduled_date', $date)
            ->whereIn('d.status', ['scheduled', 'ready'])
            ->groupBy('s.product_variant_id');

        // --- Per-product rollup (join products -> variants, then left join ledger/reserved)
        $productAvail = DB::table('products as p')
            ->join('product_variants as pv', 'pv.product_id', '=', 'p.id')
            ->leftJoinSub($ledgerSub,  'L', 'L.product_variant_id', '=', 'pv.id')
            ->leftJoinSub($reservedSub,'R', 'R.product_variant_id', '=', 'pv.id')
            ->select(
                'p.id as product_id',
                // any_available: 1 if any variant has > 0 available
                DB::raw("MAX(CASE WHEN (COALESCE(L.manual_qty,0) - COALESCE(R.reserved_qty,0)) > 0 THEN 1 ELSE 0 END) as any_available"),
                // available_qty: sum of positive availability across variants
                DB::raw("SUM(GREATEST(COALESCE(L.manual_qty,0) - COALESCE(R.reserved_qty,0), 0)) as available_qty_sum")
            )
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('p.vendor_id', $vendorIds))
            ->groupBy('p.id');

        return $productAvail;
    }

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

        // Build per-product availability rollup
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
                        // in stock only
                        $w->where('PA.any_available', 1);
                    } elseif ($availability === 'out_any') {
                        // any out-of-stock (NULL or 0)
                        $w->where(function ($q) {
                            $q->whereNull('PA.any_available')
                              ->orWhere('PA.any_available', 0);
                        });
                    } elseif ($availability === 'out_with_waitlist') {
                        // out-of-stock AND allow_waitlist
                        $w->where(function ($q) {
                            $q->where(function ($x) {
                                $x->whereNull('PA.any_available')
                                  ->orWhere('PA.any_available', 0);
                            })
                            ->where('products.allow_waitlist', true);
                        });
                    } elseif ($availability === 'in_or_out_with_waitlist') {
                        // in stock OR (out-of-stock AND allow_waitlist)
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
            // eager loads (accessors will still provide URLs if defined on model)
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