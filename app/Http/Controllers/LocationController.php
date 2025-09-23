<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use App\Models\Location;
use App\Models\VendorUser;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function index(Vendor $vendor)
    {
        return $vendor->locations()->orderBy('label')->get();
    }

    public function store(Request $req, Vendor $vendor)
    {
        $this->authorizeVendorOwner($req->user()->id, $vendor->id);

        $data = $req->validate([
            'label' => 'required|string|max:255',
            'address_line1' => 'nullable|string|max:255',
            'address_line2' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:120',
            'state' => 'nullable|string|max:80',
            'postal_code' => 'nullable|string|max:20',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'notes' => 'nullable|string|max:1000',
        ]);
        $loc = $vendor->locations()->create($data);
        return response()->json($loc, 201);
    }

    public function update(Request $req, Vendor $vendor, Location $location)
    {
        $this->authorizeVendorOwner($req->user()->id, $vendor->id);
        abort_unless($location->vendor_id === $vendor->id, 404);

        $data = $req->validate([
            'label' => 'sometimes|string|max:255',
            'address_line1' => 'nullable|string|max:255',
            'address_line2' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:120',
            'state' => 'nullable|string|max:80',
            'postal_code' => 'nullable|string|max:20',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'notes' => 'nullable|string|max:1000',
        ]);
        $location->update($data);
        return $location;
    }

    public function destroy(Request $req, Vendor $vendor, Location $location)
    {
        $this->authorizeVendorOwner($req->user()->id, $vendor->id);
        abort_unless($location->vendor_id === $vendor->id, 404);
        $location->delete();
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