<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;

class VendorController extends Controller
{
    /**
     * GET /api/vendors
     * List active vendors with their products, variants, and locations.
     * Optional filters:
     *   - q: search in vendor name
     *   - with=none : return vendors without eager relations (lighter payload)
     *   - page, per_page (pagination)
     */
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 20);
        $q       = trim((string) $request->get('q', ''));

        $query = Vendor::query()->where('active', true);

        if ($q !== '') {
            $query->where('name', 'like', '%'.$q.'%');
        }

        // by default include relations; allow opting out for smaller payloads
        if ($request->get('with') === 'none') {
            $vendors = $query->orderBy('name')->paginate($perPage);
        } else {
            $vendors = $query
                ->with([
                    'products' => function ($q) {
                        $q->where('active', true) // <- was is_active
                          ->with(['variants' => function ($v) {
                              $v->where('active', true); // <- was is_active
                          }]);
                    },
                    'locations'
                ])
                ->orderBy('name')
                ->paginate($perPage);
        }

        return response()->json($vendors);
    }

    /**
     * GET /api/vendors/{vendor}
     * Show a single vendor with products, variants, and locations.
     */
    public function show(Vendor $vendor, Request $request)
    {
        if (!$vendor->active) {
            return response()->json(['message' => 'Vendor not active'], 404);
        }

        if ($request->get('with') !== 'none') {
            $vendor->load([
                'products' => function ($q) {
                    $q->where('active', true) // <- was is_active
                      ->with(['variants' => function ($v) {
                          $v->where('active', true); // <- was is_active
                      }]);
                },
                'locations'
            ]);
        }

        return response()->json($vendor);
    }
}