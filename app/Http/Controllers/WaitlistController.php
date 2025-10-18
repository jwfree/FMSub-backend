<?php

namespace App\Http\Controllers;

use App\Models\ProductVariant;
use App\Models\Vendor;
use App\Models\WaitlistEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
}