<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests; // <-- add

class VendorMediaController extends Controller
{
    use AuthorizesRequests; // <-- add

    // POST /api/vendors/{vendor}/assets (multipart)
    public function upload(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor); // <-- now valid, uses VendorPolicy@update

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

        if (array_key_exists('name', $data))          $vendor->name = $data['name'];
        if (array_key_exists('contact_email', $data)) $vendor->contact_email = $data['contact_email'];
        if (array_key_exists('contact_phone', $data)) $vendor->contact_phone = preg_replace('/\D+/', '', $data['contact_phone'] ?? '');

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
    $qrUrl   = route('vendors.qr', ['vendor' => $vendor->id]);

    $products = $vendor->products()
        ->where('active', true)
        ->with(['variants' => fn($q) => $q->where('active', true)])
        ->orderBy('name')
        ->get();

    $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('flyers.vendor', [
        'vendor'    => $vendor,
        'products'  => $products,
        'qrPngUrl'  => $qrUrl, // <- EXACTLY this key
        'landing'   => rtrim($appBase, '/') . "/vendors/{$vendor->id}",
    ])->setPaper('letter', 'portrait');

    return $pdf->download("Vendor_{$vendor->id}_flyer.pdf");
}

}