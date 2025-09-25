<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class VendorProductController extends Controller
{
    /** Store an image and convert HEIC/HEIF → JPEG when possible. */
    private function storeImageWithHeicConversion(UploadedFile $file, string $dir): string
    {
        $disk = Storage::disk('public');
        $path = $file->store($dir, 'public');

        $ext = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: pathinfo($path, PATHINFO_EXTENSION));
        if (in_array($ext, ['heic','heif'], true) && class_exists(\Imagick::class)) {
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
                // optionally log: \Log::warning('HEIC convert failed', ['e'=>$e->getMessage()]);
            }
        }

        return $path;
    }

    // POST /api/vendors/{vendor}/products
    public function store(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        $data = $request->validate([
            'name'        => ['required','string','max:255'],
            'description' => ['nullable','string','max:5000'],
            'unit'        => ['required','string','max:64'],
            'active'      => ['nullable','boolean'],

            // allow HEIC uploads
            'image'       => ['nullable','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],

            // single variant (cents only)
            'variant'                => ['required','array'],
            'variant.sku'            => ['nullable','string','max:64'],
            'variant.name'           => ['nullable','string','max:255'],
            'variant.price_cents'    => ['required','integer','min:0'],
            'variant.currency'       => ['nullable','string','size:3'],
            'variant.active'         => ['nullable','boolean'],
        ]);

        $product = Product::create([
            'vendor_id'   => $vendor->id,
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'unit'        => $data['unit'],
            'active'      => (bool)($data['active'] ?? true),
        ]);

        if ($request->hasFile('image')) {
            $product->image_path = $this->storeImageWithHeicConversion(
                $request->file('image'),
                "vendors/{$vendor->id}/products"
            );
            $product->save();
        }

        $v = $data['variant'];

        ProductVariant::create([
            'product_id'  => $product->id,
            'sku'         => $v['sku'] ?? null,
            'name'        => $v['name'] ?? $product->unit,
            'price_cents' => (int) $v['price_cents'],
            'currency'    => strtoupper($v['currency'] ?? 'USD'),
            'active'      => (bool)($v['active'] ?? true),
        ]);

        $product->load(['variants' => fn($q) => $q->orderBy('id')]);

        return response()->json($product, 201);
    }

    // PUT /api/vendors/{vendor}/products/{product}
    public function update(Vendor $vendor, Product $product, Request $request)
    {
        $this->authorize('update', $vendor);

        if ($product->vendor_id !== $vendor->id) {
            return response()->json(['message' => 'Product does not belong to this vendor'], 404);
        }

        $data = $request->validate([
            'name'        => ['sometimes','string','max:255'],
            'description' => ['sometimes','nullable','string','max:5000'],
            'unit'        => ['sometimes','string','max:64'],
            'active'      => ['sometimes','boolean'],
        ]);

        $product->fill($data)->save();

        return response()->json($product->fresh());
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

        $product->image_path = $this->storeImageWithHeicConversion(
            $request->file('image'),
            "vendors/{$vendor->id}/products"
        );
        $product->save();

        return response()->json($product->fresh());
    }
}