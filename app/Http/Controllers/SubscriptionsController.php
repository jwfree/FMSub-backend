<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

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
    // body: { product_variant_id, start_date (Y-m-d), frequency (e.g., "weekly"), notes? }
    public function store(Request $request)
    {
        $user = Auth::user();

        $data = $request->validate([
            'product_variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'start_date'         => ['required', 'date'],
            'frequency'          => ['required', Rule::in(['weekly','biweekly','monthly'])],
            'notes'              => ['nullable', 'string', 'max:1000'],
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
        ]);

        // Future: create Stripe Checkout, handle webhook to confirm status.
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
        return response()->json($subscription->fresh());
    }

    protected function owns(Subscription $subscription): bool
    {
        $user = Auth::user();
        $customer = $user->customer;
        return $customer && $subscription->customer_id === $customer->id;
    }
}