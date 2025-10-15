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
                    Carbon::parse($req->date ?? now()->toDateString())
                );

            $date = $req->date ?? now()->toDateString();
            $locationId = $req->integer('location_id') ?: null;

            // -------- 1) Manual adds/adjustments (ledger) honoring shelf life window ----------
            $ledger = InventoryEntry::query()
                ->where('vendor_id', $vendor->id)
                ->when($locationId, fn($q) => $q->where('vendor_location_id', $locationId))
                ->whereDate('for_date', '<=', $date)
                ->where(function ($q) use ($date) {
                    $q->whereNull('shelf_life_days')
                    ->orWhereRaw('DATE(for_date) >= DATE_SUB(?, INTERVAL shelf_life_days DAY)', [$date]);
                })
                ->orderBy('created_at')
                ->get();

            // 2) Summarize ledger per variant
            $manualByVariant = $ledger
                ->groupBy('product_variant_id')
                ->map(function ($rows) {
                    return [
                        'manual_qty' => (int) $rows->sum('qty'),
                        // we’ll only expose these back to owners
                        'entries'    => $rows->map(fn($r) => [
                            'id'               => $r->id,
                            'type'             => $r->entry_type,
                            'qty'              => $r->qty,
                            'note'             => $r->note,
                            'created_at'       => $r->created_at,
                            'for_date'         => $r->for_date,
                            'shelf_life_days'  => $r->shelf_life_days,
                        ])->values(),
                    ];
                });

            // 3) Reserved from deliveries (same-day)
            $reserved = DB::table('deliveries as d')
                ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
                ->select('s.product_variant_id', DB::raw('SUM(d.qty) as qty'))
                ->where('s.vendor_id', $vendor->id)
                ->whereDate('d.scheduled_date', $date)
                ->when($locationId, fn($q) => $q->where('d.vendor_location_id', $locationId))
                ->whereIn('d.status', ['scheduled','ready'])
                ->groupBy('s.product_variant_id')
                ->pluck('qty', 'product_variant_id');

            // 4) Build response rows
            $variantIds = collect($manualByVariant->keys())
                ->merge($reserved->keys())->unique()->values();

            $variants = DB::table('product_variants as pv')
                ->join('products as p', 'p.id', '=', 'pv.product_id')
                ->select(
                    'pv.id','pv.name as variant_name','pv.price_cents','pv.quantity_per_unit','pv.unit_label','pv.sort_order',
                    'p.id as product_id','p.name as product_name'
                )
                ->whereIn('pv.id', $variantIds)
                ->orderBy('p.name')->orderBy('pv.sort_order')
                ->get();

            $rows = $variants->map(function ($v) use ($manualByVariant, $reserved, $isOwner) {
                $man   = $manualByVariant->get($v->id, ['manual_qty' => 0, 'entries' => collect()]);
                $res   = (int) ($reserved[$v->id] ?? 0);
                $avail = (int) $man['manual_qty'] - $res;
                return [
                    'product_id'         => (int) $v->product_id,
                    'product_name'       => $v->product_name,
                    'product_variant_id' => (int) $v->id,
                    'variant_name'       => $v->variant_name,
                    'price_cents'        => (int) $v->price_cents,
                    'quantity_per_unit'  => $v->quantity_per_unit ? (int)$v->quantity_per_unit : null,
                    'unit_label'         => $v->unit_label,
                    'manual_qty'         => (int) $man['manual_qty'],
                    'reserved_qty'       => $res,
                    'available_qty'      => $avail,
                    // hide per-entry details from the public
                    'entries'            => $isOwner ? array_values($man['entries']->toArray()) : [],
                ];
            })->values();

            // Orders (only for owners)
            $orders = [];
            if ($isOwner) {
                $orders = DB::table('deliveries as d')
                    ->join('subscriptions as s', 's.id', '=', 'd.subscription_id')
                    ->join('product_variants as pv', 'pv.id', '=', 's.product_variant_id')
                    ->join('products as p', 'p.id', '=', 's.product_id')
                    ->select(
                        'd.id as delivery_id','d.scheduled_date','d.status','d.qty',
                        's.id as subscription_id','s.customer_id',
                        'p.name as product_name','pv.name as variant_name','pv.id as product_variant_id'
                    )
                    ->where('s.vendor_id', $vendor->id)
                    ->whereDate('d.scheduled_date', $date)
                    ->when($locationId, fn($q) => $q->where('d.vendor_location_id', $locationId))
                    ->orderBy('p.name')->orderBy('pv.sort_order')->get();
            }

            return response()->json([
                'date'        => $date,
                'location_id' => $locationId,
                'variants'    => $rows,
                'orders'      => $orders, // [] for public
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
}