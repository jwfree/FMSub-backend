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
                $w->where('label', 'like', "%{$q}%")
                  ->orWhere('city', 'like', "%{$q}%")
                  ->orWhere('region', 'like', "%{$q}%")      // was 'state'
                  ->orWhere('postal_code', 'like', "%{$q}%");
            });
        }

        return response()->json(
            $query->orderBy('label', 'asc')->paginate($perPage)
        );
    }

    // GET /api/vendors/{vendor}/locations
    public function forVendor(Vendor $vendor)
    {
        // Lean payload; sorted by label
        return $vendor->locations()
            ->select('locations.id', 'locations.label', 'locations.city', 'locations.region')
            ->orderBy('label', 'asc')
            ->get();
    }
}