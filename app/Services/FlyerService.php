<?php

namespace App\Services;

use App\Models\Vendor;
use Illuminate\Support\Facades\Storage;
use Barryvdh\DomPDF\Facade\Pdf;

// If you don't already have QR, install: composer require simplesoftwareio/simple-qrcode
use SimpleSoftwareIO\QrCode\Facades\QrCode;

class FlyerService
{
    protected function relPath(Vendor $vendor): string
    {
        return "flyers/vendor_{$vendor->id}.pdf";
    }

    public function url(Vendor $vendor): string
    {
        return Storage::disk('public')->url($this->relPath($vendor));
    }

    public function exists(Vendor $vendor): bool
    {
        return Storage::disk('public')->exists($this->relPath($vendor));
    }

    public function generate(Vendor $vendor): void
    {
        // Landing URL the QR should point to (adjust if your app URL differs)
        $frontend = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'https://fmsubapp.fbwks.com')), '/');
        $landing  = "{$frontend}/vendors/{$vendor->id}";

        // Build QR as base64 PNG
        $qrPng = QrCode::format('png')->size(320)->margin(1)->generate($landing);
        $qrB64 = base64_encode($qrPng);
        $qrMime = 'image/png';

        // Render your existing blade and pass the extra vars your view expects
        $html = view('flyers.vendor', [
            'vendor' => $vendor,
            'qrB64'  => $qrB64,
            'qrMime' => $qrMime,
            'landing'=> $landing,
        ])->render();

        // Create the PDF
        $pdf = Pdf::loadHTML($html)->setPaper('letter', 'portrait');

        // Save to public disk so it’s served at /storage/...
        Storage::disk('public')->put($this->relPath($vendor), $pdf->output());
    }
}