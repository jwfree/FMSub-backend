<?php

namespace App\Services;

use App\Models\Notification;

class NotificationService
{
    public function send(
        int $recipientId,
        string $type,
        string $title,
        ?string $body = null,
        array $data = [],
        ?int $actorId = null
    ): Notification {
        return Notification::create([
            'recipient_id' => $recipientId,
            'actor_id'     => $actorId ?? $recipientId,
            'type'         => $type,   // e.g. subscription.created
            'title'        => $title,
            'body'         => $body,
            'data'         => $data,
        ]);
    }
}