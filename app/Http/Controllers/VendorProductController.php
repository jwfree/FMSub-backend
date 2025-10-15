<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class VendorProductController extends Controller
{
    use AuthorizesRequests;

    /** Generate a compact unique SKU if none supplied (fits in 64 chars). */
    private function makeSku(Vendor $vendor, Product $product, ?string $hint = null): string
    {
        $prefix = 'V'.$vendor->id.'P'.$product->id;
        // short random suffix (12 hex chars)
        $rand = substr(bin2hex(random_bytes(6)), 0, 12);
        // Optional human-ish hint (letters/numbers only)
        $base = preg_replace('/[^A-Za-z0-9]+/', '', (string)$hint) ?: '';
        $sku  = strtoupper($prefix.($base ? '-'.$base : '').'-'.$rand);
        return substr($sku, 0, 64);
    }

    /** Store an image and convert HEIC/HEIF → JPEG when possible. */
    private function storeImageWithHeicConversion(UploadedFile $file, string $dir): string
    {
        $disk = Storage::disk('public');
        $path = $file->store($dir, 'public');

        $ext = strtolower(
            $file->getClientOriginalExtension()
                ?: $file->extension()
                ?: pathinfo($path, PATHINFO_EXTENSION)
        );

        if (in_array($ext, ['heic','heif'], true) && \class_exists(\Imagick::class, false)) {
            try {
                $full = $disk->path($path);
                $img  = new \Imagick($full);
                if ($img->getNumberImages() > 1) {
                    $img = $img->coalesceImages();
                    $img->setIteratorIndex(0);
                }
                $img->setImageFormat('jpeg');
                $img->setImageCompressionQuality(85);

                $jpegPath = preg_replace('/\.(heic|heif)$/i', '.jpg', $path);
                $disk->put($jpegPath, $img->getImageBlob());
                $disk->delete($path);
                return $jpegPath;
            } catch (\Throwable $e) {
                // \Log::warning('HEIC convert failed', ['error' => $e->getMessage()]);
            }
        }

        return $path;
    }

    // POST /api/vendors/{vendor}/products
    public function store(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        $data = $request->validate([
            'name'            => ['required','string','max:255'],
            'description'     => ['nullable','string','max:5000'],
            'unit'            => ['required','string','max:64'],
            'active'          => ['nullable','boolean'],
            'allow_waitlist'  => ['nullable','boolean'], // <-- added

            'image'           => ['nullable','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],

            'variant'                 => ['required','array'],
            'variant.sku'             => ['nullable','string','max:64'],
            'variant.name'            => ['nullable','string','max:255'],
            'variant.price_cents'     => ['required','integer','min:0'],
            'variant.currency'        => ['nullable','string','size:3'],
            'variant.active'          => ['nullable','boolean'],
        ]);

        return DB::transaction(function () use ($vendor, $request, $data) {
            $product = Product::create([
                'vendor_id'       => $vendor->id,
                'name'            => $data['name'],
                'description'     => $data['description'] ?? null,
                'unit'            => $data['unit'],
                'active'          => (bool)($data['active'] ?? true),
                'allow_waitlist'  => (bool)($data['allow_waitlist'] ?? false), // <-- added
            ]);

            if ($request->hasFile('image')) {
                $product->image_path = $this->storeImageWithHeicConversion(
                    $request->file('image'),
                    "vendors/{$vendor->id}/products"
                );
                $product->save();
            }

            $v   = $data['variant'];
            $sku = $v['sku'] ?? ''; // may be blank
            if ($sku === '' || $sku === null) {
                // Use product name or variant name as hint
                $hint = $v['name'] ?? $product->name ?? null;
                $sku  = $this->makeSku($vendor, $product, $hint);
            }

            ProductVariant::create([
                'product_id'   => $product->id,
                'sku'          => $sku, // never null
                'name'         => $v['name'] ?? $product->unit,
                'price_cents'  => (int) $v['price_cents'],
                'currency'     => strtoupper($v['currency'] ?? 'USD'),
                'active'       => (bool)($v['active'] ?? true),
            ]);

            return response()->json(
                $product->load(['variants' => fn($q) => $q->orderBy('id')]),
                201
            );
        });
    }

    // PUT/PATCH /api/vendors/{vendor}/products/{product}
    public function update(Vendor $vendor, Product $product, Request $request)
    {
        $this->authorize('update', $vendor);

        if ($product->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Product does not belong to this vendor'], 404);
        }

        // Validate simple fields + the flag
        $data = $request->validate([
            'name'           => ['sometimes','string','max:255'],
            'description'    => ['sometimes','nullable','string','max:5000'],
            'unit'           => ['sometimes','string','max:64'],
            'active'         => ['sometimes','boolean'],
            'allow_waitlist' => ['sometimes','boolean'],
        ]);

        // Fill regular fields
        $product->fill($data);

        // IMPORTANT: with multipart/form-data we must treat "0" as present, so use exists()
        if ($request->exists('allow_waitlist')) {
            $product->allow_waitlist = $request->boolean('allow_waitlist');
        }

        $product->save();

        // If for any reason Eloquent didn't mark the column dirty, force an update once.
        if (!$product->wasChanged('allow_waitlist') && $request->exists('allow_waitlist')) {
            \DB::table('products')
                ->where('id', $product->id)
                ->update(['allow_waitlist' => $request->boolean('allow_waitlist') ? 1 : 0]);
            $product->refresh();
        }

        //return response()->json($product);
        return response()
            ->json($product)
            ->header('X-VC-Update-Hit', 'vendor-product-update');
    }
    // DELETE /api/vendors/{vendor}/products/{product}
    public function destroy(Vendor $vendor, Product $product)
    {
        $this->authorize('update', $vendor);

        if ($product->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Product does not belong to this vendor'], 404);
        }

        $oldImage = $product->image_path;
        $product->delete();
        if ($oldImage) {
            Storage::disk('public')->delete($oldImage);
        }

        return response()->json(['ok' => true]);
    }

    // POST /api/vendors/{vendor}/products/{product}/image
    public function uploadImage(Vendor $vendor, Product $product, Request $request)
    {
        $this->authorize('update', $vendor);

        if ($product->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Product does not belong to this vendor'], 404);
        }

        $request->validate([
            'image' => ['required','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],
        ]);

        $old = $product->image_path;
        $product->image_path = $this->storeImageWithHeicConversion(
            $request->file('image'),
            "vendors/{$vendor->id}/products"
        );
        $product->save();

        if ($old && $old !== $product->image_path) {
            Storage::disk('public')->delete($old);
        }

        return response()->json($product->fresh());
    }
}