<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class VendorMediaController extends Controller
{
    use AuthorizesRequests;

    /* ----------------------------- Helpers ----------------------------- */

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
     * Store an image under /storage/app/public/$dir and, if it’s HEIC/HEIF,
     * try converting it to JPEG (keeping the same relative path but .jpg).
     * Returns the relative path under the public disk.
     */
    private function storeImageWithHeicConversion(UploadedFile $file, string $dir): string
    {
        $disk = Storage::disk('public');

        // Store original upload first
        $path = $file->store($dir, 'public');

        // Detect extension
        $ext = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: pathinfo($path, PATHINFO_EXTENSION));

        // If HEIC/HEIF, try converting to JPEG via Imagick (if available)
        if (in_array($ext, ['heic', 'heif'], true) && class_exists(\Imagick::class)) {
            try {
                $full = $disk->path($path);
                $img  = new \Imagick($full);
                // Some HEICs are multi-frame; flatten to first
                if ($img->getNumberImages() > 1) {
                    $img = $img->coalesceImages();
                    $img->setIteratorIndex(0);
                }
                $img->setImageFormat('jpeg');
                $img->setImageCompressionQuality(85);

                $jpegPath = preg_replace('/\.(heic|heif)$/i', '.jpg', $path);
                $disk->put($jpegPath, $img->getImageBlob());

                // Remove original HEIC
                $disk->delete($path);

                return $jpegPath;
            } catch (\Throwable $e) {
                // Keep original if conversion fails
            }
        }

        return $path;
    }

    /**
     * Convert a storage path (or URL into /storage) to [mime, base64].
     */
    private function pathToBase64(?string $path): array
    {
        if (!$path) return [null, null];

        // 1) public disk
        if (Storage::disk('public')->exists($path)) {
            $bin  = Storage::disk('public')->get($path);
            $mime = Storage::disk('public')->mimeType($path) ?? 'image/jpeg';
            return [$mime, base64_encode($bin)];
        }

        // 2) local "public/storage/..." symlink path
        $candidate = ltrim((string) $path, '/');
        if (Str::startsWith($candidate, 'storage/')) {
            $full = public_path($candidate);
            if (is_file($full)) {
                $bin  = @file_get_contents($full);
                if ($bin !== false) {
                    $mime = @mime_content_type($full) ?: 'image/jpeg';
                    return [$mime, base64_encode($bin)];
                }
            }
        }

        // 3) full URL pointing to /storage/...
        if (filter_var($path, FILTER_VALIDATE_URL)) {
            $urlPath = ltrim(parse_url($path, PHP_URL_PATH) ?: '', '/');
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

    /* --------------------- Upload/edit vendor assets -------------------- */

    // POST /api/vendors/{vendor}/assets (multipart)
    public function upload(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        $data = $request->validate([
            'name'          => ['nullable','string','max:255'],
            'contact_email' => ['nullable','email','max:255'],
            'contact_phone' => ['nullable','string','max:32'],
            'flyer_text'    => ['nullable','string','max:5000'],
            'description'   => ['nullable','string','max:5000'],

            // Accept common web formats + HEIC/HEIF (we’ll convert those)
            'banner'        => ['nullable','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],
            'photo'         => ['nullable','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],
        ]);

        if ($request->hasFile('banner')) {
            $vendor->banner_path = $this->storeImageWithHeicConversion(
                $request->file('banner'),
                "vendors/{$vendor->id}"
            );
        }

        if ($request->hasFile('photo')) {
            $vendor->photo_path = $this->storeImageWithHeicConversion(
                $request->file('photo'),
                "vendors/{$vendor->id}"
            );
        }

        if (array_key_exists('name', $data))          $vendor->name = $data['name'];
        if (array_key_exists('contact_email', $data)) $vendor->contact_email = $data['contact_email'];
        if (array_key_exists('contact_phone', $data)) $vendor->contact_phone = preg_replace('/\D+/', '', $data['contact_phone'] ?? '');
        if (array_key_exists('description', $data))   $vendor->description = $data['description'];
        if (array_key_exists('flyer_text', $data))    $vendor->flyer_text = $data['flyer_text'];

        $vendor->save();

        return response()->json($vendor->fresh());
    }

    /* ------------------------------- QR PNG ------------------------------ */

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

    /* ----------------------------- Flyer PDF ----------------------------- */

    // Helper: build the same PDF bytes you currently download
    private function buildFlyerPdfBytes(Vendor $vendor): string
    {
        $appBase = config('app.frontend_url', env('APP_FRONTEND_URL', 'https://fmsubapp.fbwks.com'));
        $landing = rtrim($appBase, '/') . "/vendors/{$vendor->id}";

        // Keep your existing base64 image + QR approach so output matches today
        [$bannerMime, $bannerB64] = $this->pathToBase64($vendor->banner_path);
        [$photoMime,  $photoB64]  = $this->pathToBase64($vendor->photo_path);

        $qrB64  = base64_encode(QrCode::format('png')->size(240)->margin(1)->generate($landing));
        $qrMime = 'image/png';

        $products = $vendor->products()
            ->where('active', true)
            ->with(['variants' => fn ($q) => $q->where('active', true)])
            ->orderBy('name')
            ->get();

        $pdf = Pdf::loadView('flyers.vendor', [
            'vendor'       => $vendor,
            'products'     => $products,
            'landing'      => $landing,

            'bannerMime'   => $bannerMime,
            'bannerB64'    => $bannerB64,
            'photoMime'    => $photoMime,
            'photoB64'     => $photoB64,
            'qrMime'       => $qrMime,
            'qrB64'        => $qrB64,

            'prettyPhone'  => $this->prettyPhone($vendor->contact_phone),
        ])->setPaper('letter', 'portrait');

        return $pdf->output();
    }

    // GET /api/vendors/{vendor}/flyer.pdf
    // Now: cache to storage/app/public/vendor_flyers/vendor_{id}.pdf and serve inline
    public function flyer(Vendor $vendor)
    {
        $disk    = Storage::disk('public');
        $relPath = "vendor_flyers/vendor_{$vendor->id}.pdf";

        $isFresh = false;
        if ($disk->exists($relPath)) {
            $last = $disk->lastModified($relPath); // unix timestamp
            $vendorUpdated = optional($vendor->updated_at)->getTimestamp() ?? 0;
            $isFresh = $last >= $vendorUpdated;
        }

        if (!$isFresh) {
            $bytes = $this->buildFlyerPdfBytes($vendor);
            // ensure directory exists
            if (!$disk->exists('vendor_flyers')) {
                $disk->makeDirectory('vendor_flyers');
            }
            $disk->put($relPath, $bytes);
        }

        $abs = $disk->path($relPath);
        return response()->file($abs, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'inline; filename="Vendor_'.$vendor->id.'_flyer.pdf"',
            'Cache-Control'       => 'public, max-age=86400',
        ]);
    }
}