<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;


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

        // --- Optional auth: try to resolve user from Bearer token, without requiring middleware ---
        $user = $request->user(); // will be null on public routes without auth middleware
        if (!$user) {
            if ($token = $request->bearerToken()) {
                if ($pat = PersonalAccessToken::findToken($token)) {
                    $user = $pat->tokenable; // Sanctum tokenable is the User model
                }
            }
        }

        $canEdit = $user ? $user->can('update', $vendor) : false;

        return response()->json(array_merge($vendor->toArray(), [
            'can_edit' => $canEdit,
        ]));
    }
}