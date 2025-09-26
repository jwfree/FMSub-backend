<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductsController extends Controller
{
    /**
     * GET /api/products
     * q, vendor_id, page, per_page
     */
    public function index(Request $request)
    {
        $perPage     = (int) $request->integer('per_page', 20);
        $q           = trim((string) $request->get('q', ''));
        $vendorId    = $request->get('vendor_id');
        $favorites   = (bool) $request->boolean('favorites', false);
        $user        = $request->user(); // may be null on public calls

        $query = \App\Models\Product::query()
            // search name/description
            ->when($q !== '', function ($qb) use ($q) {
                $qb->where(function ($w) use ($q) {
                    $w->where('name', 'like', "%{$q}%")
                    ->orWhere('description', 'like', "%{$q}%");
                });
            })

            // filter by vendor_id if provided
            ->when($vendorId, fn ($qb) => $qb->where('vendor_id', $vendorId))

            // filter to favorite vendors (only if requested and authed)
            ->when($favorites && $user, function ($qb) use ($user) {
                $favVendorIds = $user->favoriteVendors()->pluck('vendors.id');
                // empty list -> no results
                $qb->whereIn('vendor_id', $favVendorIds->count() ? $favVendorIds : [-1]);
            })

            // only active products, from active vendors
            ->where('active', true)
            ->whereHas('vendor', fn ($v) => $v->where('active', true))

            // eager loads
            ->with([
                'vendor:id,name',
                'variants' => function ($v) {
                    $v->where('active', true)
                    ->select('id','product_id','name','sku','price_cents','active');
                },
            ])

            ->orderBy('name');

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /api/products/{product}
     */
    public function show(Product $product)
    {
        // Only allow active product + vendor
        if (!$product->active || !$product->vendor?->active) {
            return response()->json(['message' => 'Product not available'], 404);
        }

        $product->load([
            'vendor:id,name',
            'variants' => function ($q) {
                $q->where('active', true)
                  ->select('id','product_id','name','sku','price_cents','active');
            },
        ]);

        return response()->json($product);
    }
}