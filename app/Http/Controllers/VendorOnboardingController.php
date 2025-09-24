<?php

// app/Http/Controllers/VendorOnboardingController.php
namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;

class VendorOnboardingController extends Controller
{
    public function store(Request $req)
    {
        $data = $req->validate([
            'name' => ['required','string','max:255'],
            'contact_email' => ['nullable','email','max:255'],
            'contact_phone' => ['nullable','string','max:32'],
        ]);

        $vendor = Vendor::create([
            'name' => $data['name'],
            'contact_email' => $data['contact_email'] ?? null,
            'contact_phone' => preg_replace('/\D+/', '', $data['contact_phone'] ?? ''),
            'active' => true,
        ]);

        // link the current user as owner
        $vendor->users()->attach($req->user()->id, ['role' => 'owner']);

        return response()->json($vendor, 201);
    }
}