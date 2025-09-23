<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VendorController extends Controller
{
    /**
     * GET /api/vendors
     * q, with=none, page, per_page
     */
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 20);
        $q       = trim((string) $request->get('q', ''));

        $query = Vendor::query()->where('active', true);

        if ($q !== '') {
            $query->where('name', 'like', '%'.$q.'%');
        }

        if ($request->get('with') === 'none') {
            $vendors = $query->orderBy('name')->paginate($perPage);
        } else {
            $vendors = $query
                ->with([
                    'products' => function ($q) {
                        $q->where('active', true)
                          ->with(['variants' => function ($v) {
                              $v->where('active', true);
                          }]);
                    },
                    'locations',
                ])
                ->orderBy('name')
                ->paginate($perPage);
        }

        return response()->json($vendors);
    }

    /**
     * GET /api/vendors/{vendor}
     */
    public function show(Vendor $vendor, Request $request)
    {
        if (! $vendor->active) {
            return response()->json(['message' => 'Vendor not active'], 404);
        }

        if ($request->get('with') !== 'none') {
            $vendor->load([
                'products' => function ($q) {
                    $q->where('active', true)
                      ->with(['variants' => function ($v) {
                          $v->where('active', true);
                      }]);
                },
                'locations',
            ]);
        }

        // ⬇️ Add this block
        $canEdit = Auth::check() && $request->user()->can('update', $vendor);

        return response()->json(array_merge($vendor->toArray(), [
            'can_edit' => $canEdit,
        ]));
    }
}