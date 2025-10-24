<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Vendor;
use App\Models\VendorUser;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Vendor $vendor)
    {
        return $vendor->products()->latest()->paginate(20);
    }

    public function show(Product $product)
    {
        // Vendor dashboard may want inactive too; keep as-is.
        return $product->load('vendor');
    }

    public function store(Request $req, Vendor $vendor)
    {
        $this->authorizeVendorOwner($req->user()->id, $vendor->id);

        $data = $req->validate([
            'name'                  => 'required|string|max:255',
            'description'           => 'nullable|string|max:2000',
            'unit'                  => 'nullable|string|max:50',
            'price'                 => 'sometimes|numeric|min:0', // legacy
            'active'                => 'boolean',
            'allow_waitlist'        => 'sometimes|boolean',
            'subscription_options'              => ['nullable','array','max:20'],
            'subscription_options.*.value'      => ['required','string','max:40'],
            'subscription_options.*.label'      => ['nullable','string','max:60'],
        ]);

        // normalize subscription options (value/label + whitelist/regex)
        if (isset($data['subscription_options'])) {
            $data['subscription_options'] = $this->normalizeSubOptions($data['subscription_options']);
        }

        $p = $vendor->products()->create($data);

        // return with fresh relations if you like
        return response()->json($p->fresh(), 201);
    }

    public function update(Request $req, Product $product)
    {
        $this->authorizeVendorOwner($req->user()->id, $product->vendor_id);

        $data = $req->validate([
            'name'                  => 'sometimes|string|max:255',
            'description'           => 'nullable|string|max:2000',
            'unit'                  => 'nullable|string|max:50',
            'price'                 => 'sometimes|numeric|min:0', // legacy
            'active'                => 'boolean',
            'allow_waitlist'        => 'sometimes|boolean',
            'subscription_options'              => ['nullable','array','max:20'],
            'subscription_options.*.value'      => ['required','string','max:40'],
            'subscription_options.*.label'      => ['nullable','string','max:60'],
        ]);

        if (array_key_exists('subscription_options', $data)) {
            $data['subscription_options'] = $this->normalizeSubOptions($data['subscription_options']);
        }

        $product->update($data);

        // If your dashboard PATCH also sends a legacy "variant" payload,
        // you can handle it here (optional). For now we ignore it since
        // variants are managed via dedicated endpoints.

        return $product->fresh();
    }

    public function destroy(Request $req, Product $product)
    {
        $this->authorizeVendorOwner($req->user()->id, $product->vendor_id);
        $product->delete();
        return response()->noContent();
    }

    private function authorizeVendorOwner(int $userId, int $vendorId): void
    {
        $isOwner = \App\Models\VendorUser::where('vendor_id', $vendorId)
            ->where('user_id', $userId)
            ->whereIn('role', ['owner','admin'])
            ->exists();
        abort_unless($isOwner, 403);
    }

    /**
     * Normalize/validate incoming subscription options.
     * Supports:
     *   once, daily, weekly, biweekly, monthly
     *   every_{n}_days (1..31), every_{n}_weeks (1..8), every_{n}_months (1..12)
     */
    private function normalizeSubOptions(array $raw): array
    {
        $out = [];
        $allowedFixed = ['once','daily','weekly','biweekly','monthly'];
        foreach ($raw as $item) {
            $val = strtolower(trim((string)($item['value'] ?? '')));
            $label = isset($item['label']) ? trim((string)$item['label']) : null;
            if ($val === '') continue;

            $ok = false;

            if (in_array($val, $allowedFixed, true)) {
                $ok = true;
            } else {
                // every_{n}_{days|weeks|months}
                if (preg_match('/^every_(\d+)_(days|weeks|months)$/', $val, $m)) {
                    $n = (int)$m[1];
                    $unit = $m[2];
                    if ($unit === 'days'   && $n >= 1 && $n <= 31)  $ok = true;
                    if ($unit === 'weeks'  && $n >= 1 && $n <= 8)   $ok = true;
                    if ($unit === 'months' && $n >= 1 && $n <= 12)  $ok = true;
                }
            }

            if (!$ok) {
                // Skip anything invalid rather than 422 (friendlier UX);
                // if you prefer hard failure, throw a validation error instead.
                continue;
            }

            $out[] = [
                'value' => $val,
                'label' => $label ?: $this->defaultLabelFor($val),
            ];
        }

        // de-dupe by value, keep first label
        $dedup = [];
        foreach ($out as $o) {
            $dedup[$o['value']] = $dedup[$o['value']] ?? $o;
        }

        return array_values($dedup);
    }

    private function defaultLabelFor(string $value): string
    {
        return match ($value) {
            'once'     => 'One time',
            'daily'    => 'Daily',
            'weekly'   => 'Weekly',
            'biweekly' => 'Every 2 weeks',
            'monthly'  => 'Monthly',
            default    => $this->humanizeEvery($value),
        };
    }

    private function humanizeEvery(string $value): string
    {
        if (preg_match('/^every_(\d+)_(days|weeks|months)$/', $value, $m)) {
            $n = (int)$m[1];
            $unit = $m[2];
            $singular = rtrim($unit, 's');
            return $n === 1 ? "Every $singular" : "Every $n $unit";
        }
        return ucfirst($value);
    }
}