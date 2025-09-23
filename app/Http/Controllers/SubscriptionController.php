<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SubscriptionController extends Controller
{
    // For now this just returns a few static plan options per product.
    public function plans(Product $product)
    {
        // Later, read from a product_subscriptions table.
        return [
            ['plan' => 'weekly',  'interval' => 'week',  'count' => 1, 'price' => $product->price],
            ['plan' => 'biweekly','interval' => 'week',  'count' => 2, 'price' => $product->price * 2],
            ['plan' => 'monthly', 'interval' => 'month', 'count' => 1, 'price' => $product->price * 4],
        ];
    }

    public function create(Request $req)
    {
        // Stripe integration later; for MVP we create a subscription record.
        $data = $req->validate([
            'product_id' => ['required','integer','exists:products,id'],
            'plan' => ['required', Rule::in(['weekly','biweekly','monthly'])],
            'starts_on' => ['nullable','date'],
            'location_id' => ['nullable','integer','exists:locations,id'],
        ]);

        $sub = Subscription::create([
            'user_id'    => $req->user()->id,
            'product_id' => $data['product_id'],
            'plan'       => $data['plan'],
            'status'     => 'active',
            'starts_on'  => $data['starts_on'] ?? now()->toDateString(),
            'location_id'=> $data['location_id'] ?? null,
        ]);

        return response()->json($sub, 201);
    }

    public function mine(Request $req)
    {
        return Subscription::with(['product.vendor','location'])
            ->where('user_id', $req->user()->id)
            ->latest()->get();
    }

    public function pause(Subscription $subscription, Request $req)
    {
        abort_unless($subscription->user_id === $req->user()->id, 403);
        $subscription->update(['status' => 'paused']);
        return $subscription;
    }

    public function resume(Subscription $subscription, Request $req)
    {
        abort_unless($subscription->user_id === $req->user()->id, 403);
        $subscription->update(['status' => 'active']);
        return $subscription;
    }

    public function cancel(Subscription $subscription, Request $req)
    {
        abort_unless($subscription->user_id === $req->user()->id, 403);
        $subscription->update(['status' => 'cancelled','ends_on'=>now()->toDateString()]);
        return $subscription;
    }
}