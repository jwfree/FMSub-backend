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
    /**
     * POST /api/vendors/{vendor}/assets (multipart)
     * Fields: name?, contact_email?, contact_phone?, banner(image)?, photo(image)?
     */
    public function upload(Vendor $vendor, Request $request)
    {
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

        if (isset($data['name'])) {
            $vendor->name = $data['name'];
        }

        if (isset($data['contact_email'])) {
            $vendor->contact_email = $data['contact_email'];
        }

        if (array_key_exists('contact_phone', $data)) {
            // Store digits only; format for display in UI/Blade later.
            $vendor->contact_phone = preg_replace('/\D+/', '', $data['contact_phone'] ?? '');
        }

        $vendor->save();

        return response()->json($vendor->fresh());
    }

    /**
     * GET /api/vendors/{vendor}/qr.png
     * Public PNG for posters. Named route: vendors.qr
     */
    public function qr(Vendor $vendor)
    {
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $url = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        $png = QrCode::format('png')->size(480)->margin(1)->generate($url);

        return response($png, 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    /**
     * GET /api/vendors/{vendor}/flyer.pdf
     * Printable flyer (public).
     */
// app/Http/Controllers/VendorMediaController.php

    public function flyer(Vendor $vendor)
    {
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $landing = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        // Build product list (active)
        $products = $vendor->products()
            ->where('active', true)
            ->with(['variants' => fn($q) => $q->where('active', true)])
            ->orderBy('name')
            ->get();

        // Generate QR PNG bytes and embed as data URI
        $pngBytes = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
            ->size(480)->margin(1)->generate($landing);

        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('flyers.vendor', [
            'vendor'    => $vendor,
            'products'  => $products,
            'landing'   => $landing,
            'qrDataUri' => 'data:image/png;base64,' . base64_encode($pngBytes),
        ])->setPaper('letter', 'portrait');

        return $pdf->download("Vendor_{$vendor->id}_flyer.pdf");
    }
}