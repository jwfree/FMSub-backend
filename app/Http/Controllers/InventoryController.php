<?php

namespace App\Http\Controllers;

use App\Models\InventoryEntry;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\DeliveryScheduler;
use Illuminate\Support\Carbon;

class InventoryController extends Controller
{
    /**
     * GET /api/vendors/{vendor}/inventory?date=YYYY-MM-DD&location_id=#
     */
    public function index(Request $req, Vendor $vendor)
    {
        // Policy: view the vendor (any attached role)
        $this->authorize('view', $vendor);

        $vendorId   = $vendor->id;
        $date       = $req->date ?? now()->toDateString();
        $locationId = $req->integer('location_id') ?: null;
 
       app(DeliveryScheduler::class)->ensureForDate($vendor, Carbon::parse($date));

        // 1) Manual adds/adjustments (ledger)
        $ledger = InventoryEntry::query()
            ->where('vendor_id', $vendorId)
            ->whereDate('for_date', $date)
            ->when($locationId, fn ($q) => $q->where('vendor_location_id', $locationId))
            ->orderBy('created_at')
            ->get();

        // 2) Summarize ledger per variant
        $manualByVariant = $ledger
            ->groupBy('product_variant_id')
            ->map(fn ($rows) => [
                'manual_qty' => (int) $rows->sum('qty'),
                'entries'    => $rows->map(fn ($r) => [
                    'id'         => $r->id,
                    'type'       => $r->entry_type,
                    'qty'        => $r->qty,
                    'note'       => $r->note,
                    'created_at' => $r->created_at,
                ])->values(),
            ]);

        // 3) Reserved from deliveries (scheduled/ready count as holding stock)
        $reserved = DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->select('s.product_variant_id', DB::raw('SUM(d.qty) as qty'))
            ->where('s.vendor_id', $vendorId)
            ->whereDate('d.scheduled_date', $date)
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->whereIn('d.status', ['scheduled', 'ready'])
            ->groupBy('s.product_variant_id')
            ->pluck('qty', 'product_variant_id');

        // 4) Build response set of variants that matter (any in ledger or reserved)
        $variantIds = collect($manualByVariant->keys())
            ->merge($reserved->keys())
            ->unique()
            ->values();

        // Load product/variant names
        $variants = DB::table('product_variants as pv')
            ->join('products as p', 'p.id', '=', 'pv.product_id')
            ->select(
                'pv.id',
                'pv.name as variant_name',
                'pv.price_cents',
                'pv.quantity_per_unit',
                'pv.unit_label',
                'p.id as product_id',
                'p.name as product_name'
            )
            ->whereIn('pv.id', $variantIds)
            ->orderBy('p.name')
            ->orderBy('pv.sort_order')
            ->get();

        $rows = $variants->map(function ($v) use ($manualByVariant, $reserved) {
            $man    = $manualByVariant->get($v->id, ['manual_qty' => 0, 'entries' => collect()]);
            $res    = (int) ($reserved[$v->id] ?? 0);
            $avail  = (int) $man['manual_qty'] - $res;

            return [
                'product_id'         => (int) $v->product_id,
                'product_name'       => $v->product_name,
                'product_variant_id' => (int) $v->id,
                'variant_name'       => $v->variant_name,
                'price_cents'        => (int) $v->price_cents,
                'quantity_per_unit'  => $v->quantity_per_unit ? (int) $v->quantity_per_unit : null,
                'unit_label'         => $v->unit_label,
                'manual_qty'         => (int) $man['manual_qty'],
                'reserved_qty'       => $res,
                'available_qty'      => $avail,
                'entries'            => array_values($man['entries']->toArray()),
            ];
        })->values();

        // Upcoming orders to fulfill for this date
        $orders = DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->join('product_variants as pv', 'pv.id', '=', 's.product_variant_id')
            ->join('products as p', 'p.id', '=', 's.product_id')
            ->select(
                'd.id as delivery_id',
                'd.scheduled_date',
                'd.status',
                'd.qty',
                's.id as subscription_id',
                's.customer_id',
                'p.name as product_name',
                'pv.name as variant_name',
                'pv.id as product_variant_id'
            )
            ->where('s.vendor_id', $vendorId)
            ->whereDate('d.scheduled_date', $date)
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->orderBy('p.name')
            ->orderBy('pv.sort_order')
            ->get();

        return response()->json([
            'date'        => $date,
            'location_id' => $locationId,
            'variants'    => $rows,
            'orders'      => $orders,
        ]);
    }

    /**
     * POST /api/vendors/{vendor}/inventory/entries
     */
    public function store(Request $req, Vendor $vendor)
    {
        // Policy: update vendor (owner/manager)
        $this->authorize('update', $vendor);

        $data = $req->validate([
            'vendor_location_id' => ['nullable', 'integer', 'exists:vendor_locations,id'],
            'product_id'         => ['required', 'integer', 'exists:products,id'],
            'product_variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'for_date'           => ['required', 'date'],
            'qty'                => ['required', 'integer'], // +add, -adjust down
            'entry_type'         => ['required', 'in:add,adjust'],
            'note'               => ['nullable', 'string', 'max:500'],
        ]);

        $data['vendor_id']  = $vendor->id;
        $data['created_by'] = auth()->id();

        $entry = InventoryEntry::create($data);

        return response()->json($entry, 201);
    }

    /**
     * PATCH /api/vendors/{vendor}/inventory/entries/{id}
     */
    public function update(Request $req, Vendor $vendor, int $id)
    {
        // Policy: update vendor
        $this->authorize('update', $vendor);

        $entry = InventoryEntry::where('vendor_id', $vendor->id)->findOrFail($id);

        $data = $req->validate([
            'qty'        => ['sometimes', 'integer'],
            'entry_type' => ['sometimes', 'in:add,adjust'],
            'note'       => ['nullable', 'string', 'max:500'],
        ]);

        $entry->update($data);

        return response()->json($entry);
    }

    /**
     * DELETE /api/vendors/{vendor}/inventory/entries/{id}
     */
    public function destroy(Request $req, Vendor $vendor, int $id)
    {
        // Policy: update vendor
        $this->authorize('update', $vendor);

        $entry = InventoryEntry::where('vendor_id', $vendor->id)->findOrFail($id);
        $entry->delete();

        return response()->json(['ok' => true]);
    }

    public function fulfillDelivery(Request $req, Vendor $vendor, int $id)
    {
        $this->authorize('update', $vendor);

        $delivery = DB::table('deliveries')->where('id', $id)
            ->whereExists(function ($q) use ($vendor) {
                $q->from('subscriptions as s')
                ->whereColumn('s.id', 'deliveries.subscription_id')
                ->where('s.vendor_id', $vendor->id);
            })
            ->first();

        if (!$delivery) {
            return response()->json(['message' => 'Delivery not found'], 404);
        }

        if (!in_array($delivery->status, ['scheduled', 'ready'], true)) {
            return response()->json(['message' => 'Delivery not in fulfillable state'], 422);
        }

        DB::table('deliveries')->where('id', $id)->update([
            'status'       => 'fulfilled',
            'fulfilled_at' => now(),
            'updated_at'   => now(),
        ]);

        // 👉 Roll the subscription's next_delivery_date
        $sub = DB::table('subscriptions')->where('id', $delivery->subscription_id)
            ->select('id','frequency','end_date')
            ->first();

        if ($sub) {
            app(DeliveryScheduler::class)->rollNextDate(
                $sub->id,
                (string)($sub->frequency ?? 'weekly'),
                (string)$delivery->scheduled_date,
                $sub->end_date ?? null
            );
        }

        return response()->json(['ok' => true]);
    }

}