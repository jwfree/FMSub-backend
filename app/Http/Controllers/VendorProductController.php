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
        $rand   = substr(bin2hex(random_bytes(6)), 0, 12);
        $base   = preg_replace('/[^A-Za-z0-9]+/', '', (string)$hint) ?: '';
        $sku    = strtoupper($prefix.($base ? '-'.$base : '').'-'.$rand);
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
                // swallow conversion failure; keep original
            }
        }

        return $path;
    }

    // POST /api/vendors/{vendor}/products
    public function store(Vendor $vendor, Request $request)
    {
        $this->authorize('update', $vendor);

        // Accept JSON-string subscription_options in multipart
        if ($request->has('subscription_options') && is_string($request->input('subscription_options'))) {
            $decoded = json_decode($request->input('subscription_options'), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $request->merge(['subscription_options' => $decoded]);
            }
        }

        $data = $request->validate([
            'name'            => ['required','string','max:255'],
            'description'     => ['nullable','string','max:5000'],
            'unit'            => ['required','string','max:64'],
            'active'          => ['nullable','boolean'],
            'allow_waitlist'  => ['nullable','boolean'],

            'image'           => ['nullable','file','max:4096','mimes:jpeg,jpg,png,gif,webp,heic,heif'],

            'variant'                 => ['required','array'],
            'variant.sku'             => ['nullable','string','max:64'],
            'variant.name'            => ['nullable','string','max:255'],
            'variant.price_cents'     => ['required','integer','min:0'],
            'variant.currency'        => ['nullable','string','size:3'],
            'variant.active'          => ['nullable','boolean'],

            // subscription options as array of { value, label? }
            'subscription_options'         => ['nullable','array'],
            'subscription_options.*.value' => ['required','string','max:100'],
            'subscription_options.*.label' => ['nullable','string','max:100'],
        ]);

        return DB::transaction(function () use ($vendor, $request, $data) {
            $product = Product::create([
                'vendor_id'           => $vendor->id,
                'name'                => $data['name'],
                'description'         => $data['description'] ?? null,
                'unit'                => $data['unit'],
                'active'              => (bool)($data['active'] ?? true),
                'allow_waitlist'      => (bool)($data['allow_waitlist'] ?? false),
                // 👉 preserve values exactly as chosen (validated/filtered only)
                'subscription_options' => $this->sanitizeSubscriptionOptions($data['subscription_options'] ?? null),
            ]);

            if ($request->hasFile('image')) {
                $product->image_path = $this->storeImageWithHeicConversion(
                    $request->file('image'),
                    "vendors/{$vendor->id}/products"
                );
                $product->save();
            }

            $v   = $data['variant'];
            $sku = $v['sku'] ?? '';
            if ($sku === '' || $sku === null) {
                $hint = $v['name'] ?? $product->name ?? null;
                $sku  = $this->makeSku($vendor, $product, $hint);
            }

            ProductVariant::create([
                'product_id'  => $product->id,
                'sku'         => $sku,
                'name'        => $v['name'] ?? $product->unit,
                'price_cents' => (int) $v['price_cents'],
                'currency'    => strtoupper($v['currency'] ?? 'USD'),
                'active'      => (bool)($v['active'] ?? true),
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

        // Accept JSON-string subscription_options in multipart
        if ($request->has('subscription_options') && is_string($request->input('subscription_options'))) {
            $decoded = json_decode($request->input('subscription_options'), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $request->merge(['subscription_options' => $decoded]);
            }
        }        

        $data = $request->validate([
            'name'           => ['sometimes','string','max:255'],
            'description'    => ['sometimes','nullable','string','max:5000'],
            'unit'           => ['sometimes','string','max:64'],
            'active'         => ['sometimes','boolean'],
            'allow_waitlist' => ['sometimes','boolean'],

            // allow overwrite/clear of subscription options
            'subscription_options'         => ['nullable','array'],
            'subscription_options.*.value' => ['required','string','max:100'],
            'subscription_options.*.label' => ['nullable','string','max:100'],
        ]);

        // Fill normal fields (only those present)
        if (array_key_exists('name', $data))        $product->name  = $data['name'];
        if (array_key_exists('unit', $data))        $product->unit  = $data['unit'];
        if (array_key_exists('description', $data)) $product->description = $data['description'] ?? null;
        if (array_key_exists('active', $data))      $product->active = (bool)$data['active'];

        // IMPORTANT for multipart/form-data: exists() honors "0"
        if ($request->exists('allow_waitlist')) {
            $product->allow_waitlist = $request->boolean('allow_waitlist');
        }

        // Preserve subscription options exactly as sent (validated/filtered)
        if ($request->exists('subscription_options')) {
            $product->subscription_options = $this->sanitizeSubscriptionOptions($data['subscription_options'] ?? null);
        }

        $product->save();

        // If allow_waitlist came through but wasn’t flagged dirty, force write once
        if ($request->exists('allow_waitlist') && !$product->wasChanged('allow_waitlist')) {
            \DB::table('products')
                ->where('id', $product->id)
                ->update(['allow_waitlist' => $request->boolean('allow_waitlist') ? 1 : 0]);
            $product->refresh();
        }

        return response()
            ->json($product->fresh())
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

    // -------------------------
    // Helpers: subscription options (preserve-as-picked)
    // -------------------------

    /**
     * Validate/filter options without rewriting values.
     * Returns null to clear the column, or a de-duped array that preserves input order.
     *
     * Acceptable values:
     *   - once | daily | weekly | biweekly | monthly
     *   - every_{n}_{days|weeks|months}  (n >= 1)
     */
    private function sanitizeSubscriptionOptions(?array $raw): ?array
    {
        if (!$raw || count($raw) === 0) return null;

        $out  = [];
        $seen = [];

        foreach ($raw as $opt) {
            if (!is_array($opt)) continue;

            $value = (string)($opt['value'] ?? '');
            $value = strtolower(trim($value));
            if ($value === '') continue;

            if (!$this->isAllowedFrequencyValue($value)) continue;

            // de-dupe by value, preserve first occurrence & order
            if (isset($seen[$value])) continue;
            $seen[$value] = true;

            $label = array_key_exists('label', $opt) ? (string)$opt['label'] : null;
            $label = $label !== '' ? mb_substr($label, 0, 100) : null;

            $out[] = ['value' => $value, 'label' => $label];
        }

        return count($out) ? array_values($out) : null;
    }

    /** Allow friendly forms OR parametric every_{n}_{unit}. No canonicalization. */
    private function isAllowedFrequencyValue(string $v): bool
    {
        $friendly = ['once','daily','weekly','biweekly','monthly'];
        if (in_array($v, $friendly, true)) return true;

        return (bool) preg_match('/^every_([1-9]\d*)_(days|weeks|months)$/', $v);
    }
}