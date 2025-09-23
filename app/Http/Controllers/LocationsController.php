<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vendor;
use Illuminate\Http\Request;

class LocationsController extends Controller
{
    // GET /api/vendors/{vendor}/locations
    public function forVendor(Vendor $vendor)
    {
        $locations = $vendor->locations()
            ->where('active', true)
            ->orderBy('name')
            ->get();

        return response()->json($locations);
    }

    // GET /api/locations?near[lat]=..&near[lng]=..&radius_km=..
    public function index(Request $request)
    {
        $q = Location::query()->where('active', true);

        // Hook for future geo-filter/ordering
        if ($request->has(['near.lat', 'near.lng'])) {
            // TODO: distance calc + orderByRaw
        }

        return response()->json(
            $q->limit((int) $request->query('limit', 200))->get()
        );
    }
}