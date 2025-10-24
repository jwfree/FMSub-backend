<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Subscription;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SubscriptionsController extends Controller
{
    /**
     * Optional helper/plans — kept simple. Adjust to your pricing if needed.
     */
    public function plans(Product $product)
    {
        return [
            ['frequency' => 'every_1_weeks',  'interval' => 'week',  'count' => 1],
            ['frequency' => 'every_2_weeks',  'interval' => 'week',  'count' => 2],
            ['frequency' => 'every_1_months', 'interval' => 'month', 'count' => 1],
        ];
    }

    /**
     * POST /api/subscriptions
     * Accepts either:
     *  - product_variant_id (preferred; we infer product_id)
     *  - product_id (+ optional product_variant_id)
     */
    public function store(Request $req)
    {
        $user = $req->user();
        abort_unless($user, 401, 'Authentication required');

        // Basic field types first
        $data = $req->validate([
            'product_variant_id' => ['nullable','integer','exists:product_variants,id'],
            'product_id'         => ['nullable','integer','exists:products,id'],
            'frequency'          => ['required','string','max:100'],
            'quantity'           => ['nullable','integer','min:1'],
            'notes'              => ['nullable','string','max:2000'],
            'start_date'         => ['nullable','date'],
        ]);

        // Must have at least one of product_id or product_variant_id
        if (empty($data['product_id']) && empty($data['product_variant_id'])) {
            return response()->json(['message' => 'product_id or product_variant_id is required'], 422);
        }

        // Resolve product/variant and enforce consistency
        $variant = null;
        $product = null;

        if (!empty($data['product_variant_id'])) {
            $variant = ProductVariant::findOrFail($data['product_variant_id']);
            $product = Product::findOrFail($variant->product_id);
        }

        if (!empty($data['product_id'])) {
            $explicitProduct = Product::findOrFail($data['product_id']);
            // if we already resolved from variant, ensure they match
            if ($product && $explicitProduct->id !== $product->id) {
                return response()->json(['message' => 'Variant does not belong to product'], 422);
            }
            if (!$product) {
                $product = $explicitProduct;
            }
        }

        // Normalize & validate frequency string
        $freq = $this->normalizeFrequency($data['frequency']);
        if ($freq === null) {
            return response()->json([
                'message' => 'Invalid frequency. Use once, daily, weekly, biweekly, monthly, or every_{n}_{days|weeks|months}.'
            ], 422);
        }

        $sub = Subscription::create([
            'customer_id'        => $user->id,
            'vendor_id'          => $product->vendor_id,
            'product_id'         => $product->id,
            'product_variant_id' => $variant?->id,
            'status'             => 'active',
            'start_date'         => $data['start_date'] ?? now()->toDateString(),
            'end_date'           => null,
            'frequency'          => $freq, // store normalized string
            'notes'              => $data['notes'] ?? null,
            'quantity'           => $data['quantity'] ?? 1,
        ]);

        // 🔔 In-app notification to the customer
        Notification::create([
            'recipient_id' => $user->id,
            'actor_id'     => $user->id,
            'type'         => 'subscription.created',
            'title'        => 'Subscription confirmed',
            'body'         => sprintf(
                "You're subscribed to %s (%s).",
                $product->name,
                $this->labelForFrequency($freq)
            ),
            'data'         => [
                'subscription_id'    => $sub->id,
                'product_id'         => $product->id,
                'product_variant_id' => $variant?->id,
                'frequency'          => $freq,
                'quantity'           => $sub->quantity,
                'start_date'         => $sub->start_date, // string date
            ],
        ]);

        // 🔔 Notify vendor team of new subscription (actor = subscribing customer)
        foreach ($this->vendorRecipientIds((int) $product->vendor_id) as $rid) {
            Notification::create([
                'recipient_id' => $rid,
                'actor_id'     => $user->id,
                'type'         => 'subscription.new',
                'title'        => 'New subscription',
                'body'         => sprintf(
                    '%s subscribed to %s%s (qty %d, %s).',
                    $user->name ?: $user->email,
                    $product->name,
                    $variant ? ' — '.$variant->name : '',
                    (int) ($sub->quantity ?? 1),
                    $this->labelForFrequency($freq)
                ),
                'data'         => [
                    'subscription_id'    => $sub->id,
                    'product_id'         => $product->id,
                    'product_variant_id' => $variant?->id,
                    'quantity'           => (int) ($sub->quantity ?? 1),
                    'frequency'          => $freq,
                    'vendor_id'          => (int) $product->vendor_id,
                ],
            ]);
        }

        return response()->json(
            $sub->load(['product','productVariant','vendor']),
            201
        );
    }

    /**
     * GET /api/subscriptions/mine
     */
    public function mine(Request $req)
    {
        $user = $req->user();
        abort_unless($user, 401);

        return Subscription::with(['product.vendor','productVariant'])
            ->where('customer_id', $user->id)
            ->latest('id')
            ->get();
    }

    /**
     * POST /api/subscriptions/{subscription}/pause
     */
    public function pause(Request $req, Subscription $subscription)
    {
        $user = $req->user();
        abort_unless($user, 401);
        abort_unless($subscription->customer_id === $user->id, 403);

        if ($subscription->status !== 'paused') {
            $subscription->update(['status' => 'paused']);
        }

        Notification::create([
            'recipient_id' => $user->id,
            'actor_id'     => $user->id,
            'type'         => 'subscription.paused',
            'title'        => 'Subscription paused',
            'body'         => sprintf(
                'Your subscription for %s has been paused.',
                optional($subscription->product)->name ?? 'a product'
            ),
            'data'         => ['subscription_id' => $subscription->id],
        ]);

        return $subscription->fresh(['product','productVariant','vendor']);
    }

    /**
     * POST /api/subscriptions/{subscription}/resume
     */
    public function resume(Request $req, Subscription $subscription)
    {
        $user = $req->user();
        abort_unless($user, 401);
        abort_unless($subscription->customer_id === $user->id, 403);

        if ($subscription->status !== 'active') {
            $subscription->update(['status' => 'active']);
        }

        Notification::create([
            'recipient_id' => $user->id,
            'actor_id'     => $user->id,
            'type'         => 'subscription.resumed',
            'title'        => 'Subscription resumed',
            'body'         => sprintf(
                'Your subscription for %s has been resumed.',
                optional($subscription->product)->name ?? 'a product'
            ),
            'data'         => ['subscription_id' => $subscription->id],
        ]);

        return $subscription->fresh(['product','productVariant','vendor']);
    }

    /**
     * POST /api/subscriptions/{subscription}/cancel
     */
    public function cancel(Request $req, Subscription $subscription)
    {
        $user = $req->user();
        abort_unless($user, 401);
        abort_unless($subscription->customer_id === $user->id, 403);

        // Capture a Carbon instance once
        $end = now()->startOfDay();

        if ($subscription->status !== 'canceled') {
            $subscription->update([
                'status'   => 'canceled',
                'end_date' => $end->toDateString(), // store as date string (cast-friendly)
            ]);
        }

        Notification::create([
            'recipient_id' => $user->id,
            'actor_id'     => $user->id,
            'type'         => 'subscription.canceled',
            'title'        => 'Subscription canceled',
            'body'         => sprintf(
                'Your subscription for %s has been canceled.',
                optional($subscription->product)->name ?? 'a product'
            ),
            'data'         => [
                'subscription_id' => $subscription->id,
                'end_date'        => $end->toDateString(), // avoid calling ->toDateString() on a string
            ],
        ]);

        return $subscription->fresh(['product','productVariant','vendor']);
    }

    // -------------------------
    // Helpers: frequency parse
    // -------------------------

    /**
     * Normalize/validate a frequency string.
     * Returns normalized string or null if invalid.
     *
     * Stored forms:
     *  - once
     *  - every_{n}_days|weeks|months
     */
    private function normalizeFrequency(string $raw): ?string
    {
        $f = strtolower(trim($raw));

        // Legacy shortcuts
        if ($f === 'once')    return 'once';
        if ($f === 'daily')   return 'every_1_days';
        if ($f === 'weekly')  return 'every_1_weeks';
        if ($f === 'biweekly')return 'every_2_weeks';
        if ($f === 'monthly') return 'every_1_months';

        // Parametric: every_{n}_{unit}
        if (preg_match('/^every_(\d+)_(days|weeks|months)$/', $f, $m)) {
            $n = (int) $m[1];
            $unit = $m[2];

            // Sensible bounds
            if ($unit === 'days'   && $n >= 1 && $n <= 365) return "every_{$n}_days";
            if ($unit === 'weeks'  && $n >= 1 && $n <= 52)  return "every_{$n}_weeks";
            if ($unit === 'months' && $n >= 1 && $n <= 24)  return "every_{$n}_months";
        }

        return null;
    }

    /**
     * Human-readable label for notifications/UI.
     */
    private function labelForFrequency(string $normalized): string
    {
        if ($normalized === 'once') return 'Once';

        if (preg_match('/^every_(\d+)_(days|weeks|months)$/', $normalized, $m)) {
            $n = (int) $m[1];
            $unit = $m[2];

            $unitLabel = match ($unit) {
                'days'   => $n === 1 ? 'day'   : 'days',
                'weeks'  => $n === 1 ? 'week'  : 'weeks',
                'months' => $n === 1 ? 'month' : 'months',
                default  => $unit,
            };

            // Friendly aliases
            if ($unit === 'weeks' && $n === 1) return 'Weekly';
            if ($unit === 'weeks' && $n === 2) return 'Every 2 weeks';
            if ($unit === 'months' && $n === 1) return 'Monthly';
            if ($unit === 'days' && $n === 1) return 'Daily';

            return "Every {$n} {$unitLabel}";
        }

        return ucfirst($normalized);
    }

    // Add this helper inside WaitlistController (replace the old vendorRecipientIds if present)
    private function vendorRecipientIds(int $vendorId): array
    {
        // Return all user_ids tied to this vendor (owners/managers/staff)
        return \DB::table('vendor_users')
            ->where('vendor_id', $vendorId)
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();
    }

}