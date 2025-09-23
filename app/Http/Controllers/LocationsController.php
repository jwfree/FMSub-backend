<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vendor;
use Illuminate\Http\Request;

class LocationsController extends Controller
{
    // GET /api/locations
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 20);
        $q = trim((string) $request->get('q', ''));

        $query = Location::query();

        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                  ->orWhere('city', 'like', "%{$q}%")
                  ->orWhere('state', 'like', "%{$q}%")
                  ->orWhere('postal_code', 'like', "%{$q}%");
            });
        }

        return response()->json($query->orderBy('name')->paginate($perPage));
    }

    // GET /api/vendors/{vendor}/locations
    public function forVendor(Vendor $vendor)
    {
        // pull via pivot; no locations.vendor_id exists
        $locs = $vendor->locations()->orderBy('name')->get();
        return response()->json($locs);
    }
}