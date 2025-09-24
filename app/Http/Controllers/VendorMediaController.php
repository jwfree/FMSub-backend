<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class VendorMediaController extends Controller
{
    use AuthorizesRequests;

    // -----------------------------------------
    // Helpers
    // -----------------------------------------

    /** Pretty-print US phone numbers like (555) 123-4567 (simple, US-centric). */
    private function prettyPhone(?string $digits): ?string
    {
        if (!$digits) return null;
        $s = preg_replace('/\D+/', '', $digits);
        if (strlen($s) === 11 && str_starts_with($s, '1')) {
            return sprintf('(%s) %s-%s', substr($s,1,3), substr($s,4,3), substr($s,7,4));
        }
        if (strlen($s) === 10) {
            return sprintf('(%s) %s-%s', substr($s,0,3), substr($s,3,3), substr($s,6,4));
        }
        return $digits;
    }

    /**
     * Turn a stored path (or URL pointing into /storage) into [mime, base64].
     * Tries 1) storage disk ('public'), 2) public/storage symlink path, 3) URL→local resolve.
     */
    private function pathToBase64(?string $path): array
    {
        if (!$path) return [null, null];

        // 1) Try storage disk path like "vendors/1/file.jpg"
        if (Storage::disk('public')->exists($path)) {
            $bin  = Storage::disk('public')->get($path);
            $mime = Storage::disk('public')->mimeType($path) ?? 'image/jpeg';
            return [$mime, base64_encode($bin)];
        }

        // 2) Try local public "storage/..." symlink path
        $candidate = $path;
        if (Str::startsWith($candidate, '/')) {
            $candidate = ltrim($candidate, '/'); // e.g. "storage/vendors/1/file.jpg"
        }
        if (Str::startsWith($candidate, 'storage/')) {
            $full = public_path($candidate); // follows the "public/storage" symlink
            if (is_file($full)) {
                $bin  = @file_get_contents($full);
                if ($bin !== false) {
                    $mime = @mime_content_type($full) ?: 'image/jpeg';
                    return [$mime, base64_encode($bin)];
                }
            }
        }

        // 3) If it's a full URL that points to /storage/... try resolving to local file
        if (filter_var($path, FILTER_VALIDATE_URL)) {
            $urlPath = parse_url($path, PHP_URL_PATH) ?: '';
            $urlPath = ltrim($urlPath, '/'); // e.g. "storage/vendors/1/file.jpg"
            if (Str::startsWith($urlPath, 'storage/')) {
                $full = public_path($urlPath);
                if (is_file($full)) {
                    $bin  = @file_get_contents($full);
                    if ($bin !== false) {
                        $mime = @mime_content_type($full) ?: 'image/jpeg';
                        return [$mime, base64_encode($bin)];
                    }
                }
            }
        }

        return [null, null];
    }

    // -----------------------------------------
    // Upload/edit vendor assets & fields
    // -----------------------------------------

    // POST /api/vendors/{vendor}/assets (multipart)
    public function upload(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        $data = $request->validate([
            'name'          => ['nullable','string','max:255'],
            'contact_email' => ['nullable','email','max:255'],
            'contact_phone' => ['nullable','string','max:32'],
            'description'   => ['nullable','string','max:5000'],
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
        if (array_key_exists('description', $data))   $vendor->description = $data['description'];

        $vendor->save();

        return response()->json($vendor->fresh());
    }

    // -----------------------------------------
    // QR code (public)
    // -----------------------------------------

    // GET /api/vendors/{vendor}/qr.png
    public function qr(Vendor $vendor)
    {
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $url = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        $png = QrCode::format('png')->size(480)->margin(1)->generate($url);

        return response($png, 200, [
            'Content-Type'  => 'image/png',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    // -----------------------------------------
    // Flyer PDF (public)
    // -----------------------------------------

    // GET /api/vendors/{vendor}/flyer.pdf
    public function flyer(Vendor $vendor)
    {
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $landing = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        // Build inline images (3-option resolver for banner/photo)
        [$bannerMime, $bannerB64] = $this->pathToBase64($vendor->banner_path);
        [$photoMime,  $photoB64]  = $this->pathToBase64($vendor->photo_path);

        // QR always inline
        $qrB64  = base64_encode(QrCode::format('png')->size(240)->margin(1)->generate($landing));
        $qrMime = 'image/png';

        // Products (you said remove from flyer—left here in case view still expects it)
        $products = $vendor->products()
            ->where('active', true)
            ->with(['variants' => fn ($q) => $q->where('active', true)])
            ->orderBy('name')
            ->get();

        return Pdf::loadView('flyers.vendor', [
                'vendor'       => $vendor,
                'products'     => $products,
                'landing'      => $landing,

                // inline images + types
                'bannerMime'   => $bannerMime,
                'bannerB64'    => $bannerB64,
                'photoMime'    => $photoMime,
                'photoB64'     => $photoB64,
                'qrMime'       => $qrMime,
                'qrB64'        => $qrB64,

                // optional: prettified phone if the blade uses it
                'prettyPhone'  => $this->prettyPhone($vendor->contact_phone),
            ])
            ->setPaper('letter', 'portrait')
            ->download("Vendor_{$vendor->id}_flyer.pdf");
    }
}