<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VendorProductController extends Controller
{
    // POST /api/vendors/{vendor}/products
    public function store(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        $data = $request->validate([
            'name'        => ['required','string','max:255'],
            'description' => ['nullable','string','max:5000'],
            'unit'        => ['required','string','max:64'], // e.g. "dozen", "lb", "bag"
            'active'      => ['nullable','boolean'],

            // optional first variant fields
            'variant'                 => ['nullable','array'],
            'variant.sku'             => ['nullable','string','max:64'],
            'variant.name'            => ['nullable','string','max:255'], // e.g. "12 eggs"
            'variant.price'           => ['nullable','numeric','min:0'],  // dollars
            'variant.price_cents'     => ['nullable','integer','min:0'],  // OR cents
            'variant.currency'        => ['nullable','string','size:3'],
            'variant.active'          => ['nullable','boolean'],
        ]);

        $product = Product::create([
            'vendor_id'   => $vendor->id,
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'unit'        => $data['unit'],
            'active'      => (bool)($data['active'] ?? true),
        ]);

        // Optional first variant
        if (!empty($data['variant'])) {
            $v = $data['variant'];

            // prefer price_cents if provided, else convert price dollars -> cents
            $cents = isset($v['price_cents'])
                ? (int)$v['price_cents']
                : (isset($v['price']) ? (int) round($v['price'] * 100) : null);

            ProductVariant::create([
                'product_id'  => $product->id,
                'sku'         => $v['sku'] ?? null,
                'name'        => $v['name'] ?? $product->unit,
                'price_cents' => $cents ?? 0,
                'currency'    => strtoupper($v['currency'] ?? 'USD'),
                'active'      => (bool)($v['active'] ?? true),
            ]);
        }

        $product->load(['variants' => fn($q) => $q->orderBy('id')]);

        return response()->json($product, 201);
    }

    // PUT /api/vendors/{vendor}/products/{product}
    public function update(Vendor $vendor, Product $product, Request $request)
    {
        $this->authorize('update', $vendor);

        if ($product->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Product does not belong to this vendor'], 404);
        }

        $data = $request->validate([
            'name'        => ['sometimes','string','max:255'],
            'description' => ['sometimes','nullable','string','max:5000'],
            'unit'        => ['sometimes','string','max:64'],
            'active'      => ['sometimes','boolean'],
        ]);

        $product->fill($data)->save();

        return response()->json($product->fresh());
    }
}