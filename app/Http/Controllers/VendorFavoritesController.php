<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;

class VendorFavoritesController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $vendors = $user->favoriteVendors()->orderBy('name')->get();
        return response()->json($vendors);
    }

    public function store(Vendor $vendor, Request $request)
    {
        $user = $request->user();
        $user->favoriteVendors()->syncWithoutDetaching([$vendor->id]);
        return response()->json(['ok' => true]);
    }

    public function destroy(Vendor $vendor, Request $request)
    {
        $user = $request->user();
        $user->favoriteVendors()->detach($vendor->id);
        return response()->json(['ok' => true]);
    }
}