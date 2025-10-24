<?php

namespace App\Http\Controllers;

use App\Models\ProductVariant;
use App\Models\Vendor;
use App\Models\WaitlistEntry;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class WaitlistController extends Controller
{
    /**
     * POST /api/waitlist  (auth optional; attach user if present)
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'product_variant_id' => ['required','integer','exists:product_variants,id'],
            'qty'                => ['nullable','integer','min:1'],
            'note'               => ['nullable','string','max:1000'],
        ]);

        $variant = ProductVariant::with('product.vendor')->findOrFail($data['product_variant_id']);
        $product = $variant->product;

        if (!$product?->active || !$product->vendor?->active) {
            return response()->json(['message' => 'Product not available'], 422);
        }

        if (!$product->allow_waitlist) {
            return response()->json(['message' => 'Waitlist is not enabled for this product'], 422);
        }

        $entry = WaitlistEntry::create([
            'vendor_id'          => $product->vendor_id,
            'product_id'         => $product->id,
            'product_variant_id' => $variant->id,
            'customer_id'        => optional($request->user())->id,
            'qty'                => max(1, (int)($data['qty'] ?? 1)),
            'note'               => $data['note'] ?? null,
        ]);

        // 🔔 Notifications (customer + vendor team)
        $actor = $request->user(); // may be null if unauthenticated
        $vendorId = (int) $product->vendor_id;

        // Customer confirmation (only if logged in so we have a recipient)
        if ($actor) {
            Notification::create([
                'recipient_id' => $actor->id,
                'actor_id'     => $actor->id,
                'type'         => 'waitlist.joined',
                'title'        => 'Added to waitlist',
                'body'         => sprintf('You joined the waitlist for %s — %s.', $product->name, $variant->name),
                'data'         => [
                    'waitlist_id' => $entry->id,
                    'product_id'  => $product->id,
                    'variant_id'  => $variant->id,
                    'qty'         => $entry->qty,
                    'vendor_id'   => $vendorId,
                ],
            ]);
        }

        // Vendor team notification (actor = customer if available, else null)
        $vendorRecipientIds = $this->vendorRecipientIds($vendorId);
        foreach ($vendorRecipientIds as $rid) {
            Notification::create([
                'recipient_id' => $rid,
                'actor_id'     => $actor?->id, // null ok if you allow it, or set to 0
                'type'         => 'waitlist.new',
                'title'        => 'New waitlist signup',
                'body'         => sprintf(
                    '%s joined the waitlist for %s — %s (qty %d).',
                    $actor?->name ?: $actor?->email ?: 'A customer',
                    $product->name,
                    $variant->name,
                    $entry->qty
                ),
                'data'         => [
                    'waitlist_id' => $entry->id,
                    'product_id'  => $product->id,
                    'variant_id'  => $variant->id,
                    'qty'         => $entry->qty,
                    'vendor_id'   => $vendorId,
                ],
            ]);
        }

        // Return with customer phone included
        return response()->json(
            $entry->load([
                'variant:id,name',
                'product:id,name',
                'customer:id,name,email,phone',
            ]),
            201
        );
    }

    /**
     * GET /api/vendors/{vendor}/waitlist
     */
    public function indexByVendor(Vendor $vendor)
    {
        $this->authorize('update', $vendor);

        $rows = WaitlistEntry::with([
                'variant:id,product_id,name',
                'product:id,name',
                // Include phone here as well
                'customer:id,name,email,phone',
            ])
            ->where('vendor_id', $vendor->id)
            ->orderBy('created_at')
            ->get();

        return response()->json($rows);
    }

    /**
     * DELETE /api/vendors/{vendor}/waitlist/{entry}
     */
    public function destroy(Vendor $vendor, WaitlistEntry $entry)
    {
        $this->authorize('update', $vendor);

        if ($entry->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $entry->delete();
        return response()->json(['ok' => true]);
    }

    /**
     * POST /api/vendors/{vendor}/waitlist/{entry}/convert
     * Body: { date: 'YYYY-MM-DD', location_id?: number }
     * Creates a Delivery for qty, then removes waitlist row.
     */
    public function convertToOrder(Request $request, Vendor $vendor, WaitlistEntry $entry)
    {
        $this->authorize('update', $vendor);

        if ($entry->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $data = $request->validate([
            'date'        => ['required','date'],
            'location_id' => ['nullable','integer'],
            // optional: 'unit_price_cents' if you want to override, else use variant price
        ]);

        $variant = $entry->variant()->firstOrFail();
        $product = $entry->product()->firstOrFail();

        DB::table('deliveries')->insert([
            'subscription_id'     => null,
            'scheduled_date'      => $data['date'],
            'status'              => 'scheduled',
            'vendor_location_id'  => $data['location_id'] ?? null,
            'qty'                 => $entry->qty,
            'unit_price_cents'    => $variant->price_cents,
            'total_price_cents'   => $variant->price_cents * $entry->qty,
            'product_id'          => $product->id,
            'product_variant_id'  => $variant->id,
            'customer_id'         => $entry->customer_id,
            'created_at'          => now(),
            'updated_at'          => now(),
        ]);

        $entry->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * GET /api/waitlists/mine
     * Returns current user's waitlist entries with position/total per VARIANT,
     * including product + vendor + image_url.
     */
    public function mine(Request $request)
    {
        $customerId = $request->user()->id;

        // 1) Fetch this customer's entries (keep joins lean; preload what we need later)
        $mine = WaitlistEntry::query()
            ->where('customer_id', $customerId)
            ->orderBy('created_at')
            ->get(['id','vendor_id','product_id','product_variant_id','qty','note','created_at']);

        if ($mine->isEmpty()) {
            return response()->json([]);
        }

        // 2) Collect variant ids we need to compute positions/totals for
        $variantIds = $mine->pluck('product_variant_id')->unique()->all();

        // 3) Fetch ALL rows for those variants (to compute position/total) in one query
        $allForThoseVariants = WaitlistEntry::query()
            ->whereIn('product_variant_id', $variantIds)
            ->orderBy('product_variant_id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id','product_id','product_variant_id','customer_id','created_at']);

        // 4) Build position + total maps per variant
        $perVariant = [];
        foreach ($allForThoseVariants as $row) {
            $vid = (int) $row->product_variant_id;
            if (!isset($perVariant[$vid])) {
                $perVariant[$vid] = [
                    'total' => 0,
                    'order' => [], // array of [entry_id => position]
                ];
            }
            $perVariant[$vid]['total']++;
            $pos = $perVariant[$vid]['total']; // 1-based as we append
            $perVariant[$vid]['order'][(int) $row->id] = $pos;
        }

        // 5) Preload products/vendors/variants for the user's entries
        $productIds = $mine->pluck('product_id')->unique()->all();
        $variantModels = ProductVariant::query()
            ->whereIn('id', $variantIds)
            ->get(['id','name','product_id','price_cents'])
            ->keyBy('id');

        $products = \App\Models\Product::query()
            ->whereIn('id', $productIds)
            ->with(['vendor:id,name'])
            ->get(['id','name','vendor_id','image_path'])
            ->keyBy('id');

        // 6) Shape response
        $out = $mine->map(function ($e) use ($perVariant, $variantModels, $products) {
            $vid  = (int) $e->product_variant_id;
            $pid  = (int) $e->product_id;

            $variant   = $variantModels->get($vid);
            $product   = $products->get($pid);
            $vendor    = $product?->vendor;

            $total     = (int) ($perVariant[$vid]['total'] ?? 0);
            $position  = (int) ($perVariant[$vid]['order'][(int) $e->id] ?? 0);

            // Build public image URL if you store product images on the 'public' disk
            $imagePath = $product?->image_path; // adjust to your schema
            $imageUrl  = $imagePath ? Storage::disk('public')->url($imagePath) : null;

            return [
                'id'        => (int) $e->id,
                'qty'       => (int) $e->qty,
                'note'      => $e->note,
                'created_at'=> $e->created_at?->toISOString(),
                'position'  => $position,
                'total'     => $total,

                'variant'   => $variant ? [
                    'id'    => (int) $variant->id,
                    'name'  => $variant->name,
                    'price_cents' => (int) $variant->price_cents,
                ] : null,

                'product'   => $product ? [
                    'id'    => (int) $product->id,
                    'name'  => $product->name,
                    'image_url' => $imageUrl,
                    'vendor' => $vendor ? [
                        'id'   => (int) $vendor->id,
                        'name' => $vendor->name,
                    ] : null,
                ] : null,
            ];
        })->values();

        return response()->json($out);
    }

    public function destroyMine(WaitlistEntry $entry)
    {
        $user = request()->user();
        if (!$user || $entry->customer_id !== $user->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $entry->delete();
        return response()->json(['ok' => true]);
    }

// Add this helper inside WaitlistController (replace the old vendorRecipientIds if present)
private function vendorRecipientIds(int $vendorId): array
{
    // Return all user_ids tied to this vendor (owners/managers/staff)
    return \DB::table('vendor_users')
        ->where('vendor_id', $vendorId)
        ->pluck('user_id')
        ->unique()
        ->values()
        ->all();
}

}