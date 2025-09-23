<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Vendor;
use App\Models\VendorUser;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Vendor $vendor)
    {
        return $vendor->products()->latest()->paginate(20);
    }

    public function show(Product $product)
    {
        return $product->load('vendor');
    }

    public function store(Request $req, Vendor $vendor)
    {
        $this->authorizeVendorOwner($req->user()->id, $vendor->id);

        $data = $req->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'unit' => 'nullable|string|max:50',
            'price' => 'required|numeric|min:0',
            'active' => 'boolean',
            // later: capacity, variant fields, etc.
        ]);

        $p = $vendor->products()->create($data);
        return response()->json($p, 201);
    }

    public function update(Request $req, Product $product)
    {
        $this->authorizeVendorOwner($req->user()->id, $product->vendor_id);

        $data = $req->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:2000',
            'unit' => 'nullable|string|max:50',
            'price' => 'sometimes|numeric|min:0',
            'active' => 'boolean',
        ]);
        $product->update($data);
        return $product;
    }

    public function destroy(Request $req, Product $product)
    {
        $this->authorizeVendorOwner($req->user()->id, $product->vendor_id);
        $product->delete();
        return response()->noContent();
    }

    private function authorizeVendorOwner(int $userId, int $vendorId): void
    {
        $isOwner = VendorUser::where('vendor_id', $vendorId)
            ->where('user_id', $userId)
            ->whereIn('role', ['owner','admin'])
            ->exists();
        abort_unless($isOwner, 403);
    }
}