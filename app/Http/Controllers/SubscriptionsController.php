<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Models\ProductVariant;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use App\Services\NotificationService;

class SubscriptionsController extends Controller
{
    // GET /api/subscriptions/mine
    public function mine(Request $request)
    {
        $user = Auth::user();

        $customer = $user->customer; // assumes User hasOne Customer
        if (! $customer) {
            return response()->json([]);
        }

        $subs = Subscription::query()
            ->where('customer_id', $customer->id)
            ->with(['product', 'productVariant', 'vendor'])
            ->orderByDesc('id')
            ->get();

        return response()->json($subs);
    }

    // POST /api/subscriptions
    // body: { product_variant_id, start_date (Y-m-d), frequency, notes?, quantity? }
    public function store(Request $request)
    {
        $user = Auth::user();

        $data = $request->validate([
            'product_variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'start_date'         => ['required', 'date'],
            'frequency'          => ['required', Rule::in(['weekly','biweekly','monthly'])],
            'notes'              => ['nullable', 'string', 'max:1000'],
            'quantity'           => ['nullable', 'integer', 'min:1'],
        ]);

        $customer = $user->customer;
        if (! $customer) {
            return response()->json(['message' => 'No customer profile found.'], 422);
        }

        $variant = ProductVariant::with('product.vendor')->findOrFail($data['product_variant_id']);
        $product = $variant->product;
        $vendor  = $product->vendor;

        $sub = Subscription::create([
            'customer_id'        => $customer->id,
            'vendor_id'          => $vendor->id,
            'product_id'         => $product->id,
            'product_variant_id' => $variant->id,
            'status'             => 'active',
            'start_date'         => $data['start_date'],
            'frequency'          => $data['frequency'],
            'notes'              => $data['notes'] ?? null,
            'quantity'           => $request->integer('quantity', 1),
        ]);

        // CUSTOMER notification
        app(NotificationService::class)->send(
            recipientId: $user->id,
            type: 'subscription.created',
            title: 'Subscription confirmed',
            body: sprintf("You're subscribed to %s (%s).", $product->name, $data['frequency']),
            data: [
                'subscription_id'    => $sub->id,
                'product_id'         => $product->id,
                'product_variant_id' => $variant->id,
                'frequency'          => $data['frequency'],
                'quantity'           => $request->integer('quantity', 1),
                'start_date'         => $data['start_date'],
            ],
            actorId: $user->id
        );

        // VENDOR notification(s)
        $this->notifyVendor(
            vendor: $vendor,
            type: 'vendor.subscription.created',
            title: 'New subscription',
            body: sprintf(
                '%s subscribed to %s%s (%s).',
                $this->displayCustomerName($user),
                $product->name,
                $variant->name ? ' — ' . $variant->name : '',
                $data['frequency']
            ),
            data: [
                'subscription_id'    => $sub->id,
                'customer_id'        => $customer->id,
                'product_id'         => $product->id,
                'product_variant_id' => $variant->id,
                'frequency'          => $data['frequency'],
                'quantity'           => $request->integer('quantity', 1),
                'start_date'         => $data['start_date'],
            ],
            actorId: $user->id
        );

        return response()->json($sub->load(['product', 'productVariant', 'vendor']), 201);
    }

    // POST /api/subscriptions/{subscription}/pause
    public function pause(Subscription $subscription)
    {
        if (! $this->owns($subscription)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($subscription->status !== 'active') {
            return response()->json(['message' => 'Only active subscriptions can be paused.'], 422);
        }

        $subscription->update(['status' => 'paused']);

        $user   = Auth::user();
        $vendor = $subscription->vendor;
        $product = $subscription->product;
        $variant = $subscription->productVariant;

        // CUSTOMER notification
        app(NotificationService::class)->send(
            recipientId: $user->id,
            type: 'subscription.paused',
            title: 'Subscription paused',
            body: sprintf(
                'Your subscription for %s%s has been paused.',
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        // VENDOR notification(s)
        $this->notifyVendor(
            vendor: $vendor,
            type: 'vendor.subscription.paused',
            title: 'Subscription paused',
            body: sprintf(
                '%s paused their subscription for %s%s.',
                $this->displayCustomerName($user),
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        return response()->json($subscription->fresh());
    }

    // POST /api/subscriptions/{subscription}/resume
    public function resume(Subscription $subscription)
    {
        if (! $this->owns($subscription)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($subscription->status !== 'paused') {
            return response()->json(['message' => 'Only paused subscriptions can be resumed.'], 422);
        }

        $subscription->update(['status' => 'active']);

        $user   = Auth::user();
        $vendor = $subscription->vendor;
        $product = $subscription->product;
        $variant = $subscription->productVariant;

        // CUSTOMER notification
        app(NotificationService::class)->send(
            recipientId: $user->id,
            type: 'subscription.resumed',
            title: 'Subscription resumed',
            body: sprintf(
                'Your subscription for %s%s has been resumed.',
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        // VENDOR notification(s)
        $this->notifyVendor(
            vendor: $vendor,
            type: 'vendor.subscription.resumed',
            title: 'Subscription resumed',
            body: sprintf(
                '%s resumed their subscription for %s%s.',
                $this->displayCustomerName($user),
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        return response()->json($subscription->fresh());
    }

    // POST /api/subscriptions/{subscription}/cancel
    public function cancel(Subscription $subscription)
    {
        if (! $this->owns($subscription)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($subscription->status === 'canceled') {
            return response()->json($subscription);
        }

        $subscription->update(['status' => 'canceled']);

        $user   = Auth::user();
        $vendor = $subscription->vendor;
        $product = $subscription->product;
        $variant = $subscription->productVariant;

        // CUSTOMER notification
        app(NotificationService::class)->send(
            recipientId: $user->id,
            type: 'subscription.canceled',
            title: 'Subscription canceled',
            body: sprintf(
                'Your subscription for %s%s has been canceled.',
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        // VENDOR notification(s)
        $this->notifyVendor(
            vendor: $vendor,
            type: 'vendor.subscription.canceled',
            title: 'Subscription canceled',
            body: sprintf(
                '%s canceled their subscription for %s%s.',
                $this->displayCustomerName($user),
                optional($product)->name ?? 'a product',
                $variant?->name ? (' — ' . $variant->name) : ''
            ),
            data: ['subscription_id' => $subscription->id],
            actorId: $user->id
        );

        return response()->json($subscription->fresh());
    }

    protected function owns(Subscription $subscription): bool
    {
        $user = Auth::user();
        $customer = $user->customer;
        return $customer && $subscription->customer_id === $customer->id;
    }

    /**
     * Attempt to resolve vendor recipient user IDs:
     * - Prefer $vendor->user_id (owner) if present
     * - Else, if a relation "users()" exists, notify all attached users
     * - Else, return empty (no vendor notifications)
     */
    private function vendorRecipientIds(Vendor $vendor): array
    {
        // Common single-owner column
        if (isset($vendor->user_id) && $vendor->user_id) {
            return [(int) $vendor->user_id];
        }

        // Team/pivot: a users() relation on Vendor (if you have it)
        if (method_exists($vendor, 'users')) {
            try {
                return $vendor->users()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
            } catch (\Throwable $e) {
                // Relation not configured as expected — swallow and continue
            }
        }

        return [];
    }

    private function notifyVendor(
        Vendor $vendor,
        string $type,
        string $title,
        string $body,
        array $data = [],
        ?int $actorId = null
    ): void {
        $ids = $this->vendorRecipientIds($vendor);
        if (!$ids) return;

        $svc = app(NotificationService::class);
        foreach ($ids as $uid) {
            $svc->send(
                recipientId: $uid,
                type: $type,
                title: $title,
                body: $body,
                data: $data,
                actorId: $actorId
            );
        }
    }

    private function displayCustomerName($user): string
    {
        // Use User->name if present, else Customer name, else fallback
        $name = trim((string)($user->name ?? ''));
        if ($name !== '') return $name;

        $cust = $user->customer;
        $cname = $cust ? trim((string)($cust->name ?? '')) : '';
        return $cname !== '' ? $cname : 'A customer';
    }
}