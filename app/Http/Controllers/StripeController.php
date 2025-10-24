<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;
use Stripe\StripeClient;

class StripeController extends Controller
{
    private function client(): StripeClient
    {
        return new StripeClient(config('services.stripe.secret'));
    }

    public function createConnectLink(Request $req, Vendor $vendor)
    {
        $this->authorize('update', $vendor);

        $stripe = $this->client();

        // If vendor doesn't have an account, create one (Standard account)
        if (!$vendor->stripe_account_id) {
            $account = $stripe->accounts->create([
                'type' => 'standard',
                // Optionally prefill email, business type, etc.
                'email' => $vendor->contact_email,
            ]);
            $vendor->stripe_account_id = $account->id;
            $vendor->save();
        }

        // Generate an onboarding link
        $link = $stripe->accountLinks->create([
            'account'     => $vendor->stripe_account_id,
            'refresh_url' => config('app.url') . '/vendor/stripe/refresh', // your frontend route
            'return_url'  => config('app.url') . '/vendor/stripe/return',  // your frontend route
            'type'        => 'account_onboarding',
        ]);

        return response()->json(['url' => $link->url]);
    }

    public function createLoginLink(Request $req, Vendor $vendor)
    {
        $this->authorize('update', $vendor);
        abort_unless($vendor->stripe_account_id, 422, 'Vendor is not connected to Stripe');

        $stripe = $this->client();
        $loginLink = $stripe->accounts->createLoginLink($vendor->stripe_account_id);

        return response()->json(['url' => $loginLink->url]);
    }
}