<?php

namespace App\Services;

use App\Models\Vendor;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class DeliveryScheduler
{
    /**
     * Ensure there is a delivery row for every active subscription
     * that should deliver on $date for the given vendor.
     */

    public function ensureForDate(Vendor $vendor, Carbon $date): void
    {
        $theDate = $date->toDateString();

        $schema = DB::getSchemaBuilder();
        $hasEndDate          = $schema->hasColumn('subscriptions', 'end_date');
        $hasNextDeliveryDate = $schema->hasColumn('subscriptions', 'next_delivery_date');
        $hasVendorLocId      = $schema->hasColumn('subscriptions', 'vendor_location_id');
        $hasQuantity         = $schema->hasColumn('subscriptions', 'quantity');
        $hasFrequency        = $schema->hasColumn('subscriptions', 'frequency');

        // deliveries table extras we may need to set
        $deliveriesHasUnitPrice = $schema->hasColumn('deliveries', 'unit_price_cents');
        $deliveriesHasCurrency  = $schema->hasColumn('deliveries', 'currency');
        $deliveriesHasTotal     = $schema->hasColumn('deliveries', 'total_price_cents');

        // Pick a default location (required by deliveries)
        $defaultVendorLocId = $this->getDefaultVendorLocationId($vendor);
        if (!$defaultVendorLocId) return;

        // Build subscription select
        $cols = ['id','product_id','product_variant_id','customer_id','start_date'];
        if ($hasQuantity)         $cols[] = 'quantity';
        if ($hasFrequency)        $cols[] = 'frequency';
        if ($hasEndDate)          $cols[] = 'end_date';
        if ($hasNextDeliveryDate) $cols[] = 'next_delivery_date';
        if ($hasVendorLocId)      $cols[] = 'vendor_location_id';

        $subsQ = DB::table('subscriptions')
            ->where('vendor_id', $vendor->id)
            ->where('status', 'active')
            ->whereDate('start_date', '<=', $theDate);

        if ($hasEndDate) {
            $subsQ->where(function ($w) use ($theDate) {
                $w->whereNull('end_date')->orWhereDate('end_date', '>=', $theDate);
            });
        }
        if ($hasNextDeliveryDate) {
            $subsQ->where(function ($w) use ($theDate) {
                $w->whereNull('next_delivery_date')->orWhereDate('next_delivery_date', '<=', $theDate);
            });
        }

        $subs = $subsQ->select($cols)->get();
        if ($subs->isEmpty()) return;

        // Preload current prices for all variant ids we’ll touch
        $variantIds = $subs->pluck('product_variant_id')->filter()->unique()->values();
        $variantPrices = $variantIds->isEmpty()
            ? collect()
            : DB::table('product_variants')->whereIn('id', $variantIds)
                ->pluck('price_cents', 'id'); // [variant_id => price_cents]

        foreach ($subs as $s) {
            if (!$this->subscriptionMatchesDate($s, $theDate)) continue;
            $exists = DB::table('deliveries')
                ->where('subscription_id', $s->id)
                ->whereDate('scheduled_date', $theDate)
                ->exists();
            if ($exists) continue;

            $qty = $hasQuantity ? (int)($s->quantity ?? 1) : 1;
            $deliverLocId = $hasVendorLocId ? ($s->vendor_location_id ?: $defaultVendorLocId) : $defaultVendorLocId;

            $unitPrice = 0;
            if ($deliveriesHasUnitPrice) {
                $unitPrice = (int) ($variantPrices[$s->product_variant_id] ?? 0);
            }

            $insert = [
                'subscription_id'    => $s->id,
                'vendor_location_id' => $deliverLocId,
                'scheduled_date'     => $theDate,
                'status'             => 'scheduled',
                'qty'                => $qty,
                'created_at'         => now(),
                'updated_at'         => now(),
            ];

            if ($deliveriesHasUnitPrice) $insert['unit_price_cents'] = $unitPrice;
            if ($deliveriesHasCurrency)  $insert['currency'] = 'USD';

            // NEW: set total_price_cents if the column exists
            if ($deliveriesHasTotal) {
                $insert['total_price_cents'] = (int) ($qty * $unitPrice);
            }

            DB::table('deliveries')->insert($insert);
        }
    }
    /**
     * Pick a deterministic default vendor_location_id.
     * Strategy: the first linked location (lowest vendor_locations.id) for this vendor.
     * Returns null if the vendor has no locations.
     */
    protected function getDefaultVendorLocationId(Vendor $vendor): ?int
    {
        $row = DB::table('vendor_locations as vl')
            ->join('locations as l', 'l.id', '=', 'vl.location_id')
            ->where('vl.vendor_id', $vendor->id)
            ->orderBy('vl.id', 'asc')        // stable first
            ->select('l.id')
            ->first();

        return $row ? (int)$row->id : null;
    }

    /**
     * Compute and persist next_delivery_date after a delivery on $fromDate.
     * If end_date is set and the next date exceeds it, we can null out or leave as-is.
     */
    public function rollNextDate(int $subscriptionId, string $frequency, string $fromDate, ?string $endDate = null): void
    {
        $schema = DB::getSchemaBuilder();
        if (!$schema->hasColumn('subscriptions', 'next_delivery_date')) {
            return; // nothing to do; column not present
        }

        $next = $this->calcNextDate($frequency, Carbon::parse($fromDate));

        if ($endDate && Carbon::parse($endDate)->lt($next)) {
            DB::table('subscriptions')->where('id', $subscriptionId)->update([
                'next_delivery_date' => null,
                'updated_at'         => now(),
            ]);
            return;
        }

        DB::table('subscriptions')->where('id', $subscriptionId)->update([
            'next_delivery_date' => $next->toDateString(),
            'updated_at'         => now(),
        ]);
    }
    /**
     * Does this subscription’s cadence fall on $theDate?
     * Supports 'weekly' (default), 'biweekly', 'monthly'.
     */
    protected function subscriptionMatchesDate(object $s, string $theDate): bool
    {
        $start = Carbon::parse($s->start_date)->startOfDay();
        $date  = Carbon::parse($theDate)->startOfDay();

        if ($date->lt($start)) return false;

        $freq = strtolower($s->frequency ?? 'weekly');
        return match ($freq) {
            'biweekly' => $start->diffInWeeks($date) % 2 === 0,
            'monthly'  => $start->isSameDay($date) || $start->day === $date->day,
            default    => $start->diffInWeeks($date) % 1 === 0, // weekly
        };
    }

    /**
     * Calculate next date strictly after $from.
     */
    protected function calcNextDate(string $frequency, Carbon $from): Carbon
    {
        $freq = strtolower($frequency ?: 'weekly');
        return match ($freq) {
            'biweekly' => $from->copy()->addWeeks(2),
            'monthly'  => $from->copy()->addMonthNoOverflow(),
            default    => $from->copy()->addWeek(),
        };
    }
}