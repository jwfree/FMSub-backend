<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductsController extends Controller
{
    /**
     * GET /api/products
     * List active products with vendor + variants.
     * Optional filters:
     *   - vendor_id: only products for a vendor
     *   - q: search in product name/description
     *   - page, per_page
     */
    public function index(Request $request)
    {
        $perPage   = (int) $request->integer('per_page', 24);
        $vendorId  = $request->integer('vendor_id');
        $q         = trim((string) $request->get('q', ''));

        $query = Product::query()
            ->where('is_active', true)
            ->with([
                'vendor' => function ($v) {
                    $v->select('id', 'name', 'active');
                },
                'variants' => function ($vv) {
                    $vv->where('is_active', true);
                },
            ]);

        if ($vendorId) {
            $query->where('vendor_id', $vendorId);
        }

        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'like', '%'.$q.'%')
                    ->orWhere('description', 'like', '%'.$q.'%');
            });
        }

        $products = $query
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json($products);
    }

    /**
     * GET /api/products/{product}
     * Single product with vendor + active variants.
     */
    public function show(Product $product)
    {
        if (!$product->is_active) {
            return response()->json(['message' => 'Product not active'], 404);
        }

        $product->load([
            'vendor:id,name,active',
            'variants' => function ($q) {
                $q->where('is_active', true);
            },
        ]);

        return response()->json($product);
    }
}