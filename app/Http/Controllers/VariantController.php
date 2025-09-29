<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class VariantController extends Controller
{
    // POST /vendors/{vendor}/products/{product}/variants
    public function store(Request $req, $vendorId, Product $product)
    {
        // Ensure this user can modify this vendor/product (your policy or Gate)
        Gate::authorize('update', $product->vendor);

        $data = $req->validate([
            'sku'               => ['nullable','string','max:64'],
            'name'              => ['required','string','max:100'],
            'price_cents'       => ['required','integer','min:0'],
            'currency'          => ['required','string','size:3'],
            'active'            => ['boolean'],
            'quantity_per_unit' => ['nullable','integer','min:1'],
            'unit_label'        => ['nullable','string','max:32'],
            'sort_order'        => ['nullable','integer','min:0'],
        ]);

        $variant = $product->variants()->create($data + ['active' => $data['active'] ?? true]);

        return response()->json($variant, 201);
    }

    // PATCH /variants/{variant}
    public function update(Request $req, ProductVariant $variant)
    {
        Gate::authorize('update', $variant->product->vendor);

        $data = $req->validate([
            'sku'               => ['sometimes','nullable','string','max:64'],
            'name'              => ['sometimes','string','max:100'],
            'price_cents'       => ['sometimes','integer','min:0'],
            'currency'          => ['sometimes','string','size:3'],
            'active'            => ['sometimes','boolean'],
            'quantity_per_unit' => ['sometimes','nullable','integer','min:1'],
            'unit_label'        => ['sometimes','nullable','string','max:32'],
            'sort_order'        => ['sometimes','integer','min:0'],
        ]);

        $variant->update($data);

        return response()->json($variant);
    }

    // DELETE /variants/{variant}
    public function destroy(ProductVariant $variant)
    {
        Gate::authorize('update', $variant->product->vendor);

        $variant->delete();

        return response()->json(['ok' => true]);
    }
}