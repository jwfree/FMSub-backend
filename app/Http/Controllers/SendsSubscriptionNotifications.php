<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Subscription;
use App\Services\Notifier;
use Illuminate\Support\Facades\DB;

trait SendsSubscriptionNotifications
{
    /**
     * Notify customer + vendor team when a subscription is CREATED.
     */
    protected function notifySubscriptionCreated(Subscription $sub): void
    {
        /** @var Notifier $notifier */
        $notifier = app(Notifier::class);

        // Customer (note: subscriptions.customer_id stores users.id in your app)
        $notifier->subscriptionCreated(
            $sub->customer_id,
            [
                'subscription_id' => $sub->id,
                'product_id'      => $sub->product_id,
                'product_variant_id' => $sub->product_variant_id,
                'frequency'       => $sub->frequency,
                'quantity'        => (int) $sub->quantity,
                'start_date'      => $sub->start_date,
            ],
            $sub->customer_id // actor
        );

        // Vendor team (owners/managers/staff)
        foreach ($this->vendorRecipientIds((int)$sub->vendor_id) as $rid) {
            $notifier->notify($rid, [
                'type'  => 'subscription.new',
                'title' => 'New subscription',
                'body'  => 'A customer subscribed to a plan.',
                'data'  => [
                    'subscription_id'    => $sub->id,
                    'product_id'         => $sub->product_id,
                    'product_variant_id' => $sub->product_variant_id,
                    'quantity'           => (int) $sub->quantity,
                    'frequency'          => $sub->frequency,
                    'vendor_id'          => (int) $sub->vendor_id,
                ],
                'actor' => $sub->customer_id,
            ]);
        }
    }

    /**
     * Notify when a subscription is PAUSED.
     */
    protected function notifySubscriptionPaused(Subscription $sub): void
    {
        /** @var Notifier $notifier */
        $notifier = app(Notifier::class);

        $notifier->subscriptionPaused(
            $sub->customer_id,
            ['subscription_id' => $sub->id],
            $sub->customer_id
        );
    }

    /**
     * Notify when a subscription is RESUMED.
     */
    protected function notifySubscriptionResumed(Subscription $sub): void
    {
        /** @var Notifier $notifier */
        $notifier = app(Notifier::class);

        // Reusing "created" copy would be odd; keep it specific:
        $notifier->notify($sub->customer_id, [
            'type'  => 'subscription.resumed',
            'title' => 'Subscription resumed',
            'body'  => 'Your subscription has been resumed.',
            'data'  => ['subscription_id' => $sub->id],
            'actor' => $sub->customer_id,
        ]);
    }

    /**
     * Notify when a subscription is CANCELED.
     */
    protected function notifySubscriptionCanceled(Subscription $sub): void
    {
        /** @var Notifier $notifier */
        $notifier = app(Notifier::class);

        $notifier->subscriptionCanceled(
            $sub->customer_id,
            [
                'subscription_id' => $sub->id,
                'end_date'        => $sub->end_date,
            ],
            $sub->customer_id
        );
    }

    /**
     * Helper: all user_ids tied to a vendor (owners/managers/staff).
     */
    protected function vendorRecipientIds(int $vendorId): array
    {
        return DB::table('vendor_users')
            ->where('vendor_id', $vendorId)
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();
    }
}