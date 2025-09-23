<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use Barryvdh\DomPDF\Facade\Pdf;

class VendorMediaController extends Controller
{
    // POST /api/vendors/{vendor}/assets (multipart)
    public function upload(Vendor $vendor, Request $request)
    {
        // Only vendor owner/admin – adjust Gate as you prefer
        Gate::authorize('update-vendor', $vendor);

        $data = $request->validate([
            'name'          => ['nullable','string','max:255'],
            'contact_email' => ['nullable','email','max:255'],
            'contact_phone' => ['nullable','string','max:32'],
            'banner'        => ['nullable','image','max:4096'],
            'photo'         => ['nullable','image','max:4096'],
        ]);

        if ($request->hasFile('banner')) {
            $path = $request->file('banner')->store("vendors/{$vendor->id}", 'public');
            $vendor->banner_path = $path;
        }
        if ($request->hasFile('photo')) {
            $path = $request->file('photo')->store("vendors/{$vendor->id}", 'public');
            $vendor->photo_path = $path;
        }

        if (isset($data['name']))          $vendor->name = $data['name'];
        if (isset($data['contact_email'])) $vendor->contact_email = $data['contact_email'];
        if (isset($data['contact_phone'])) $vendor->contact_phone = preg_replace('/\D+/', '', $data['contact_phone'] ?? '');

        $vendor->save();

        return response()->json($vendor->fresh());
    }

    // GET /api/vendors/{vendor}/qr.png
    public function qr(Vendor $vendor, Request $request)
    {
        // Public: a market shopper scans this; encode the public vendor page
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $url = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        $png = QrCode::format('png')->size(480)->margin(1)->generate($url);

        return response($png, 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    // GET /api/vendors/{vendor}/flyer.pdf
    public function flyer(Vendor $vendor)
    {
        // public or protected – your call; many vendors will print it themselves
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $qrUrl = route('vendors.qr', ['vendor' => $vendor->id]);

        $products = $vendor->products()
            ->where('active', true)
            ->with(['variants' => fn($q) => $q->where('active', true)])
            ->orderBy('name')
            ->get();

        $pdf = Pdf::loadView('flyers.vendor', [
            'vendor'   => $vendor,
            'products' => $products,
            'qrPngUrl' => $qrUrl,
            'landing'  => rtrim($appBase, '/') . "/vendors/{$vendor->id}",
        ])->setPaper('letter', 'portrait');

        return $pdf->download("Vendor_{$vendor->id}_flyer.pdf");
    }
}