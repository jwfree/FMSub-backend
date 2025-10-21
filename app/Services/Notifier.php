<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Arr;

class Notifier
{
    /**
     * Create an in-app notification.
     *
     * @param  int|User  $recipient  The user who receives the notification
     * @param  array  $payload  [
     *   'type'  => string (e.g. 'subscription.created', 'inventory.notice'),
     *   'title' => string,
     *   'body'  => string|null,
     *   'data'  => array|null,   // anything you want to deep-link the UI
     *   'actor' => int|User|null // who triggered it (optional)
     *   // future: 'email' => bool, 'sms' => bool (ignored for now)
     * ]
     */
    public function notify(int|User $recipient, array $payload): Notification
    {
        $recipientId = $recipient instanceof User ? $recipient->id : $recipient;
        $actorId     = null;

        if ($actor = Arr::get($payload, 'actor')) {
            $actorId = $actor instanceof User ? $actor->id : (int) $actor;
        }

        $type  = (string) Arr::get($payload, 'type', 'generic');
        $title = (string) Arr::get($payload, 'title', '');
        $body  = Arr::get($payload, 'body');
        $data  = Arr::get($payload, 'data');

        // 🔧 NEW: auto-enrich canonical product fields if possible
        $payload = $this->enrichProductData([
            'type'  => $type,
            'title' => $title,
            'body'  => $body,
            'data'  => $data,
            'actor' => $actorId,
        ]);
        $data  = $payload['data'];
        
        /** In-app notification (DB) */
        $notification = Notification::create([
            'recipient_id' => $recipientId,
            'actor_id'     => $actorId,
            'type'         => $type,
            'title'        => $title,
            'body'         => $body,
            'data'         => $data,
        ]);

        /**
         * ──────────────────────────────────────────────────────────────
         * Future: fan out to email / SMS here (behind feature flags)
         * Example shape you can use later:
         *
         * if (!empty($payload['email'])) { $this->sendEmail($recipientId, $notification); }
         * if (!empty($payload['sms']))   { $this->sendSms($recipientId, $notification); }
         * ──────────────────────────────────────────────────────────────
         */

        return $notification;
    }

    // ────────────────────────────────────────────────────────────────
    // Convenience helpers for common events
    // (use/rename any you like; they all call ->notify(...) under the hood)
    // ────────────────────────────────────────────────────────────────

    public function subscriptionCreated(int|User $recipient, array $data = [], int|User|null $actor = null): Notification
    {
        return $this->notify($recipient, [
            'type'  => 'subscription.created',
            'title' => 'Subscription confirmed',
            'body'  => 'Your subscription has been received.',
            'data'  => $data, // e.g. ['subscription_id' => 123]
            'actor' => $actor,
        ]);
    }

    public function subscriptionPaused(int|User $recipient, array $data = [], int|User|null $actor = null): Notification
    {
        return $this->notify($recipient, [
            'type'  => 'subscription.paused',
            'title' => 'Subscription paused',
            'body'  => 'Your subscription has been paused.',
            'data'  => $data,
            'actor' => $actor,
        ]);
    }

    public function subscriptionCanceled(int|User $recipient, array $data = [], int|User|null $actor = null): Notification
    {
        return $this->notify($recipient, [
            'type'  => 'subscription.canceled',
            'title' => 'Subscription cancelled',
            'body'  => 'Your subscription has been cancelled.',
            'data'  => $data,
            'actor' => $actor,
        ]);
    }

    public function inventoryExtraStock(int|User $recipient, string $productName, array $data = [], int|User|null $actor = null): Notification
    {
        return $this->notify($recipient, [
            'type'  => 'inventory.extra_stock',
            'title' => 'Extra stock available',
            'body'  => "Extra stock is available for {$productName}.",
            'data'  => $data, // e.g. ['product_id' => 9, 'variant_id' => 31]
            'actor' => $actor,
        ]);
    }

    public function deliveryOptions(int|User $recipient, array $data = [], int|User|null $actor = null): Notification
    {
        return $this->notify($recipient, [
            'type'  => 'delivery.options',
            'title' => 'Delivery options',
            'body'  => 'Please review your delivery options.',
            'data'  => $data, // e.g. ['delivery_id' => 555]
            'actor' => $actor,
        ]);
    }
    use App\Models\Product; // at the top with other uses

        /**
         * Ensure notifications have consistent product fields in data:
         * product_id, product_name, image_url, vendor_id, vendor_name
         */
        protected function enrichProductData(array $payload): array
        {
            $data = $payload['data'] ?? [];

            // 1) If caller provided a Product instance directly (optional)
            if (isset($payload['product']) && $payload['product'] instanceof Product) {
                $p = $payload['product']->loadMissing('vendor:id,name');
                $data = array_merge([
                    'product_id'   => $p->id,
                    'product_name' => $p->name,
                    'image_url'    => $p->image_url,
                    'vendor_id'    => $p->vendor_id,
                    'vendor_name'  => optional($p->vendor)->name,
                ], $data);
            }

            // 2) If they passed product_id only (most common)
            elseif (!empty($data['product_id'])) {
                $needName   = empty($data['product_name']);
                $needImg    = !array_key_exists('image_url', $data);
                $needVendId = !array_key_exists('vendor_id', $data);
                $needVendNm = !array_key_exists('vendor_name', $data);

                if ($needName || $needImg || $needVendId || $needVendNm) {
                    $p = Product::query()
                        ->select(['id','name','image_url','vendor_id'])
                        ->with(['vendor:id,name'])
                        ->find($data['product_id']);

                    if ($p) {
                        $data = array_merge([
                            'product_id'   => $p->id,
                            'product_name' => $p->name,
                            'image_url'    => $p->image_url,
                            'vendor_id'    => $p->vendor_id,
                            'vendor_name'  => optional($p->vendor)->name,
                        ], $data);
                    }
                }
            }

            // 3) If only a product_name string was passed (legacy), keep it
            //    but we can’t lookup without an id.
            $payload['data'] = $data;
            unset($payload['product']); // don’t persist this helper key

            return $payload;
        }


    // ────────────────────────────────────────────────────────────────
    // Stubs for later (email/SMS) – not used yet
    // ────────────────────────────────────────────────────────────────

    protected function sendEmail(int $recipientId, Notification $notification): void
    {
        // hook up to your mailer later
    }

    protected function sendSms(int $recipientId, Notification $notification): void
    {
        // hook up to your SMS provider later
    }
}