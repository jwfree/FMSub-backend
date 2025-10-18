<?php

namespace App\Http\Controllers;

use App\Models\InventoryEntry;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Support\Carbon;

class InventoryController extends Controller
{
    public function index(Request $req, Vendor $vendor)
    {
        // Dual-mode: vendors/staff get full detail, shoppers get public snapshot
        $isOwner = auth()->check() && auth()->user()->can('view', $vendor);
        if ($isOwner) {
            // enforce policy for staff so they still need permission
            $this->authorize('view', $vendor);
        }

        // Ensure deliveries exist for the date (harmless for public; prepares reserved counts)
        app(\App\Services\DeliveryScheduler::class)
            ->ensureForDate(
                $vendor,
                \Illuminate\Support\Carbon::parse($req->date ?? now()->toDateString())
            );

        $date       = $req->date ?? now()->toDateString();
        $locationId = $req->integer('location_id') ?: null;

        // -------- Ledger (detail) honoring shelf-life window ----------
        $ledgerRows = \App\Models\InventoryEntry::query()
            ->where('vendor_id', $vendor->id)
            ->when($locationId, fn ($q) => $q->where('vendor_location_id', $locationId))
            ->whereDate('for_date', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('shelf_life_days')
                ->orWhereRaw('DATE(for_date) >= DATE_SUB(?, INTERVAL shelf_life_days DAY)', [$date]);
            })
            ->orderBy('created_at')
            ->get();

        $ledgerByVariant = $ledgerRows
            ->groupBy('product_variant_id')
            ->map(function ($rows) {
                return [
                    'manual_qty' => (int) $rows->sum('qty'),
                    'entries'    => $rows->map(fn ($r) => [
                        'id'              => $r->id,
                        'type'            => $r->entry_type,
                        'qty'             => $r->qty,
                        'note'            => $r->note,
                        'created_at'      => $r->created_at,
                        'for_date'        => $r->for_date,
                        'shelf_life_days' => $r->shelf_life_days,
                    ])->values(),
                ];
            });

        // -------- Subqueries for rollups (manual & reserved) ----------
        $entriesTable = (new \App\Models\InventoryEntry())->getTable();

        $ledgerSub = \DB::table("$entriesTable as ie")
            ->select('ie.product_variant_id', \DB::raw('SUM(ie.qty) as manual_qty'))
            ->where('ie.vendor_id', $vendor->id)
            ->when($locationId, fn ($q) => $q->where('ie.vendor_location_id', $locationId))
            ->whereDate('ie.for_date', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('ie.shelf_life_days')
                ->orWhereRaw('DATE(ie.for_date) >= DATE_SUB(?, INTERVAL ie.shelf_life_days DAY)', [$date]);
            })
            ->groupBy('ie.product_variant_id');

        $reservedSub = \DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->select('s.product_variant_id', \DB::raw('SUM(d.qty) as reserved_qty'))
            ->where('s.vendor_id', $vendor->id)
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->whereDate('d.scheduled_date', $date)
            ->whereIn('d.status', ['scheduled','ready'])
            ->groupBy('s.product_variant_id');

        // -------- Return ALL variants for this vendor (even if no activity yet) ----------
        $variants = \DB::table('product_variants as pv')
            ->join('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoinSub($ledgerSub,  'L', 'L.product_variant_id', '=', 'pv.id')
            ->leftJoinSub($reservedSub,'R', 'R.product_variant_id', '=', 'pv.id')
            ->select(
                'pv.id as product_variant_id',
                'pv.name as variant_name',
                'pv.price_cents',
                'pv.quantity_per_unit',
                'pv.unit_label',
                'pv.sort_order',
                'p.id as product_id',
                'p.name as product_name',
                \DB::raw('COALESCE(L.manual_qty, 0) as manual_qty'),
                \DB::raw('COALESCE(R.reserved_qty, 0) as reserved_qty'),
                \DB::raw('(COALESCE(L.manual_qty, 0) - COALESCE(R.reserved_qty, 0)) as available_qty')
            )
            ->where('p.vendor_id', $vendor->id)
            // Show only active to the public; owners can see all
            ->when(!$isOwner, fn ($q) => $q->where('p.active', true)->where('pv.active', true))
            ->orderBy('p.name')
            ->orderBy('pv.sort_order')
            ->get();

        // -------- Shape response rows (include per-entry details only for owners) ----------
        $rows = $variants->map(function ($v) use ($ledgerByVariant, $isOwner) {
            $entriesPack = $ledgerByVariant->get($v->product_variant_id, ['manual_qty' => 0, 'entries' => collect()]);

            return [
                'product_id'         => (int) $v->product_id,
                'product_name'       => $v->product_name,
                'product_variant_id' => (int) $v->product_variant_id,
                'variant_name'       => $v->variant_name,
                'price_cents'        => (int) $v->price_cents,
                'quantity_per_unit'  => $v->quantity_per_unit ? (int) $v->quantity_per_unit : null,
                'unit_label'         => $v->unit_label,
                'manual_qty'         => (int) $v->manual_qty,
                'reserved_qty'       => (int) $v->reserved_qty,
                'available_qty'      => (int) $v->available_qty,
                'entries'            => $isOwner
                    ? array_values(($entriesPack['entries'] ?? collect())->toArray())
                    : [],
            ];
        })->values();

        // -------- Orders list (unchanged) ----------
        $orders = \DB::table('deliveries as d')
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
            ->where('s.vendor_id', $vendor->id)
            ->whereDate('d.scheduled_date', $date)
            ->when($locationId, fn ($q) => $q->where('d.vendor_location_id', $locationId))
            ->whereIn('d.status', ['scheduled', 'ready', 'picked_up','skipped','missed','refunded'])
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
    public function store(Request $req, Vendor $vendor)
    {
        $this->authorize('update', $vendor);

        $data = $req->validate([
            'vendor_location_id'  => ['nullable','integer','exists:vendor_locations,id'],
            'product_id'          => ['required','integer','exists:products,id'],
            'product_variant_id'  => ['required','integer','exists:product_variants,id'],
            'for_date'            => ['required','date'],
            'qty'                 => ['required','integer'],
            'entry_type'          => ['required','in:add,adjust'],
            'note'                => ['nullable','string','max:500'],
            'shelf_life_days'     => ['nullable','integer','min:0','max:65535'], // NEW
        ]);

        $data['vendor_id']  = $vendor->id;
        $data['created_by'] = auth()->id();

        $entry = InventoryEntry::create($data);

        return response()->json($entry, 201);
    }

    // -------- BULK with dry-run --------------------------------------------
    public function storeBulk(Request $req, Vendor $vendor)
    {
        $this->authorize('update', $vendor);

        $data = $req->validate([
            'vendor_location_id'  => ['nullable','integer','exists:vendor_locations,id'],
            'product_id'          => ['required','integer','exists:products,id'],
            'product_variant_id'  => ['required','integer','exists:product_variants,id'],
            'start_date'          => ['required','date'],
            'end_date'            => ['required','date','after_or_equal:start_date'],
            'qty'                 => ['required','integer'],
            'entry_type'          => ['required', Rule::in(['add','adjust'])],
            'note'                => ['nullable','string','max:500'],
            'pattern'             => ['required','array'],
            'pattern.kind'        => ['required', Rule::in(['daily','every_n_days','weekly','monthly'])],
            'pattern.n'           => ['nullable','integer','min:2'],
            'dry_run'             => ['sometimes','boolean'],
            'shelf_life_days'     => ['nullable','integer','min:0','max:65535'], // NEW
        ]);

        $start = Carbon::parse($data['start_date'])->startOfDay();
        $end   = Carbon::parse($data['end_date'])->startOfDay();
        $kind  = $data['pattern']['kind'];
        $n     = $kind === 'every_n_days' ? (int)($data['pattern']['n'] ?? 2) : null;

        $dates = [];
        $cursor = $start->copy();
        $max = 1000;
        while ($cursor->lte($end) && count($dates) < $max) {
            $dates[] = $cursor->toDateString();
            if ($kind === 'daily') $cursor->addDay();
            elseif ($kind === 'weekly') $cursor->addDays(7);
            elseif ($kind === 'monthly') $cursor->addMonthNoOverflow();
            else $cursor->addDays($n ?? 2);
        }

        if ($req->boolean('dry_run')) {
            return response()->json([
                'ok'      => true,
                'created' => count($dates),
                'dates'   => $dates,
                'dry_run' => true,
            ]);
        }

        $now = now();
        $rows = [];
        foreach ($dates as $for) {
            $rows[] = [
                'vendor_id'          => $vendor->id,
                'vendor_location_id' => $data['vendor_location_id'] ?? null,
                'product_id'         => $data['product_id'],
                'product_variant_id' => $data['product_variant_id'],
                'for_date'           => $for,
                'qty'                => $data['qty'],
                'entry_type'         => $data['entry_type'],
                'note'               => $data['note'] ?? null,
                'shelf_life_days'    => $data['shelf_life_days'] ?? null, // NEW
                'created_by'         => auth()->id(),
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
        }

        InventoryEntry::query()->insert($rows);

        return response()->json([
            'ok'      => true,
            'created' => count($rows),
            'dates'   => $dates,
            'dry_run' => false,
        ], 201);
    }

    public function update(Request $req, Vendor $vendor, int $id)
    {
        $this->authorize('update', $vendor);

        $entry = InventoryEntry::where('vendor_id', $vendor->id)->findOrFail($id);
        $data  = $req->validate([
            'qty'              => ['sometimes','integer'],
            'entry_type'       => ['sometimes','in:add,adjust'],
            'note'             => ['nullable','string','max:500'],
            'shelf_life_days'  => ['nullable','integer','min:0','max:65535'], // NEW
            // (Optional) allow adjusting the effective date:
            // 'for_date'      => ['sometimes','date'],
        ]);

        $entry->update($data);
        return response()->json($entry);
    }

    public function destroy(Request $req, Vendor $vendor, int $id)
    {
        $this->authorize('update', $vendor);
        $entry = InventoryEntry::where('vendor_id', $vendor->id)->findOrFail($id);
        $entry->delete();
        return response()->json(['ok' => true]);
    }

    /**
     * Vendor-scoped delivery actions for inventory page.
     * Maps UI actions to deliveries.status enum values:
     *   - ready      -> ready
     *   - fulfilled  -> picked_up
     *   - cancel     -> refunded
     */
    public function readyDelivery(Vendor $vendor, int $id)
    {
        return $this->deliveryAction($vendor, $id, 'ready');
    }

    public function cancelDelivery(Vendor $vendor, int $id)
    {
        return $this->deliveryAction($vendor, $id, 'cancel');
    }

    public function fulfillDelivery(Vendor $vendor, int $id)
    {
        return $this->deliveryAction($vendor, $id, 'fulfilled');
    }

    protected function deliveryAction(Vendor $vendor, int $id, string $action)
    {
        // Ensure the delivery belongs to this vendor
        $delivery = DB::table('deliveries as d')
            ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
            ->where('d.id', $id)
            ->where('s.vendor_id', $vendor->id)
            ->select('d.id', 'd.status')
            ->first();

        if (!$delivery) {
            return response()->json(['message' => 'Delivery not found for this vendor'], 404);
        }

        // Map UI action -> allowed enum value
        $newStatus = match ($action) {
            'ready'     => 'ready',
            'fulfilled' => 'picked_up',
            'cancel'    => 'refunded',
            default     => null,
        };

        if ($newStatus === null) {
            return response()->json(['message' => 'Unsupported action'], 422);
        }

        // Update the row
        DB::table('deliveries')
            ->where('id', $id)
            ->update([
                'status'     => $newStatus,   // Query Builder quotes this safely
                'updated_at' => now(),
            ]);

        return response()->json(['ok' => true, 'id' => $id, 'status' => $newStatus]);
    }   


}