<?php

namespace App\Support;

use App\Models\InventoryEntry;
use Illuminate\Support\Facades\DB;

trait AvailabilityQueries
{
    /**
     * Build a per-product availability rollup subquery.
     * - Ledger window: for_date <= :date AND (shelf_life_days IS NULL OR for_date >= DATE_SUB(:date, INTERVAL shelf_life_days DAY))
     * - Reserved: deliveries for :date with status in [scheduled, ready]
     * - Per-variant available = manual - reserved
     * - Roll up to product:
     *     any_available = MAX(available_qty > 0)
     *     available_qty_sum = SUM(GREATEST(available_qty, 0))
     */
    protected function buildProductAvailabilityRollup(array $vendorIds, string $date, ?int $locationId = null)
    {
        $entriesTable = (new InventoryEntry())->getTable();

        // Ledger (manual) up to $date with shelf-life window
        $ledgerSub = DB::table("$entriesTable as ie")
            ->select('ie.product_variant_id', DB::raw('SUM(ie.qty) as manual_qty'))
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('ie.vendor_id', $vendorIds))
            ->when($locationId, fn ($q) => $q->where('ie.vendor_location_id', $locationId))
            ->whereDate('ie.for_date', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('ie.shelf_life_days')
                  ->orWhereRaw('DATE(ie.for_date) >= DATE_SUB(?, INTERVAL ie.shelf_life_days DAY)', [$date]);
            })
            ->groupBy('ie.product_variant_id');

        // Reserved from deliveries (same day)
        $reservedSub = DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->select('s.product_variant_id', DB::raw('SUM(d.qty) as reserved_qty'))
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('s.vendor_id', $vendorIds))
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->whereDate('d.scheduled_date', $date)
            ->whereIn('d.status', ['scheduled', 'ready'])
            ->groupBy('s.product_variant_id');

        // Per-product rollup
        $productAvail = DB::table('products as p')
            ->join('product_variants as pv', 'pv.product_id', '=', 'p.id')
            ->leftJoinSub($ledgerSub,  'L', 'L.product_variant_id', '=', 'pv.id')
            ->leftJoinSub($reservedSub,'R', 'R.product_variant_id', '=', 'pv.id')
            ->select(
                'p.id as product_id',
                DB::raw("MAX(CASE WHEN (COALESCE(L.manual_qty,0) - COALESCE(R.reserved_qty,0)) > 0 THEN 1 ELSE 0 END) as any_available"),
                DB::raw("SUM(GREATEST(COALESCE(L.manual_qty,0) - COALESCE(R.reserved_qty,0), 0)) as available_qty_sum")
            )
            ->when(!empty($vendorIds), fn ($q) => $q->whereIn('p.vendor_id', $vendorIds))
            ->groupBy('p.id');

        return $productAvail;
    }
}