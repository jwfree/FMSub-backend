<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Subscription;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Services\NotificationService;

class SubscriptionController extends Controller
{
    /**
     * (Optional helper) Show a few plan options for a product.
     * If your real pricing differs, adjust or remove.
     */
    public function plans(Product $product)
    {
        $price = method_exists($product, 'getAttribute') && $product->getAttribute('price')
            ? $product->price
            : null;

        return [
            ['frequency' => 'weekly',   'interval' => 'week',  'count' => 1, 'price_hint' => $price],
            ['frequency' => 'biweekly', 'interval' => 'week',  'count' => 2, 'price_hint' => $price],
            ['frequency' => 'monthly',  'interval' => 'month', 'count' => 1, 'price_hint' => $price],
        ];
    }

    /**
     * POST /api/subscriptions
     * Body:
     * {
     *   product_id: number,
     *   product_variant_id?: number,
     *   frequency: 'weekly'|'biweekly'|'monthly',
     *   quantity?: number,
     *   notes?: string,
     *   start_date?: 'YYYY-MM-DD'
     * }
     */
    public function create(Request $req)
    {
        $user = $req->user();
        abort_unless($user, 401, 'Authentication required');

        $data = $req->validate([
            'product_id'         => ['required','integer','exists:products,id'],
            'product_variant_id' => ['nullable','integer','exists:product_variants,id'],
            'frequency'          => ['required', Rule::in(['weekly','biweekly','monthly'])],
            'quantity'           => ['nullable','integer','min:1'],
            'notes'              => ['nullable','string','max:2000'],
            'start_date'         => ['nullable','date'],
        ]);

        $product = Product::findOrFail($data['product_id']);

        // Optional: enforce variant -> product consistency if sent
        if (!empty($data['product_variant_id'])) {
            $variant = ProductVariant::findOrFail($data['product_variant_id']);
            if ($variant->product_id !== $product->id) {
                return response()->json(['message' => 'Variant does not belong to product'], 422);
            }
        }

        $sub = Subscription::create([
            'customer_id'        => $user->id,
            'vendor_id'          => $product->vendor_id,
            'product_id'         => $product->id,
            'product_variant_id' => $data['product_variant_id'] ?? null,
            'status'             => 'active',
            'start_date'         => $data['start_date'] ?? now()->toDateString(),
            'end_date'           => null,
            'frequency'          => $data['frequency'],
            'notes'              => $data['notes'] ?? null,
            'quantity'           => $data['quantity'] ?? 1,
        ]);

        // In-app notification to the customer
        Notification::create([
            'recipient_id' => $user->id,
            'actor_id'     => $user->id,
            'type'         => 'subscription.created',
            'title'        => 'Subscription confirmed',
            'body'         => sprintf(
                "You're subscribed to %s (%s).",
                $product->name,
                $data['frequency']
            ),
            'data'         => [
                'subscription_id' => $sub->id,
                'product_id'      => $product->id,
                'product_variant_id' => $data['product_variant_id'] ?? null,
                'frequency'       => $data['frequency'],
                'quantity'        => $data['quantity'] ?? 1,
                'start_date'      => $sub->start_date?->toDateString(),
            ],
        ]);

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
            'data'         => [
                'subscription_id' => $subscription->id,
            ],
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
            'data'         => [
                'subscription_id' => $subscription->id,
            ],
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

        if ($subscription->status !== 'canceled') {
            $subscription->update([
                'status'   => 'canceled',
                'end_date' => now()->toDateString(),
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
                'end_date'        => $subscription->end_date?->toDateString(),
            ],
        ]);

        return $subscription->fresh(['product','productVariant','vendor']);
    }
}