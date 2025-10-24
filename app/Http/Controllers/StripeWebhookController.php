<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Subscription;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Webhook;
use Stripe\StripeClient;

class StripeWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $payload = $request->getContent();
        $sig     = $request->header('Stripe-Signature');
        $secret  = config('services.stripe.webhook_secret');

        try {
            $event = Webhook::constructEvent($payload, $sig, $secret);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Invalid signature'], 400);
        }

        if ($event->type === 'checkout.session.completed') {
            $session = $event->data->object; // \Stripe\Checkout\Session
            $piId = $session->payment_intent ?? null;
            if (!$piId) return response()->json(['ok' => true]);

            $stripe = new StripeClient(config('services.stripe.secret'));
            $pi = $stripe->paymentIntents->retrieve($piId, []);

            $m = $pi->metadata ?? (object)[];

            $userId    = (int) ($m->user_id ?? 0);
            $vendorId  = (int) ($m->vendor_id ?? 0);
            $productId = (int) ($m->product_id ?? 0);
            $variantId = (int) ($m->product_variant_id ?: 0);
            $qty       = (int) ($m->quantity ?? 1);
            $freq      = (string) ($m->frequency ?? 'weekly');
            $notes     = (string) ($m->notes ?? '');

            // 1) Record payment
            $amountCents = (int) $pi->amount_received;
            $payment = Payment::create([
                'customer_id' => $userId,
                'vendor_id'   => $vendorId,
                'subscription_id' => null, // we’ll fill after subscription creation
                'delivery_id' => null,
                'amount_cents'=> $amountCents,
                'currency'    => strtolower($pi->currency ?? 'usd'),
                'status'      => 'succeeded',
                'stripe_payment_intent_id'   => $pi->id,
                'stripe_checkout_session_id' => $session->id,
            ]);

            // 2) Create subscription now that we’ve been paid
            $product = Product::findOrFail($productId);
            $variant = $variantId ? ProductVariant::find($variantId) : null;

            $sub = Subscription::create([
                'customer_id'        => $userId,
                'vendor_id'          => $vendorId,
                'product_id'         => $productId,
                'product_variant_id' => $variant?->id ?? $variantId ?: null,
                'status'             => 'active',
                'start_date'         => now()->toDateString(),
                'end_date'           => null,
                'frequency'          => $this->normalizeFrequency($freq) ?? 'every_1_weeks',
                'notes'              => $notes ?: null,
                'quantity'           => $qty,
            ]);

            $payment->update(['subscription_id' => $sub->id]);

            // 3) (Optional) compute/store app fee in fees table if you want a record separate from Stripe application fee
            // 4) Allocate inventory + send notifications: call your existing logic (same as current store())
            app(\App\Http\Controllers\SubscriptionsController::class)
              ->notifyCreated($sub); // you can refactor notification-only logic into a public helper

            return response()->json(['ok' => true]);
        }

        return response()->json(['ok' => true]);
    }

    private function normalizeFrequency(string $f): ?string
    {
        $f = strtolower(trim($f));
        if ($f === 'once') return 'once';
        if ($f === 'daily') return 'every_1_days';
        if ($f === 'weekly') return 'every_1_weeks';
        if ($f === 'biweekly') return 'every_2_weeks';
        if ($f === 'monthly') return 'every_1_months';
        if (preg_match('/^every_(\d+)_(days|weeks|months)$/', $f)) return $f;
        return null;
    }
}