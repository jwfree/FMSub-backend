<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\NotificationPreference;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotificationsController extends Controller
{
    /** GET /api/notifications */
    public function index(Request $request)
    {
        $user = $request->user();

        $q = Notification::query()
            ->where('recipient_id', $user->id)
            ->latest('id');

        // Optional filters: ?read=0|1 & ?type=foo
        if ($request->filled('read')) {
            $read = (int) $request->query('read');
            if ($read === 1) {
                $q->whereNotNull('read_at');
            } else {
                $q->whereNull('read_at');
            }
        }
        if ($request->filled('type')) {
            $q->where('type', $request->query('type'));
        }

        $perPage = (int) $request->integer('per_page') ?: 25;
        $perPage = max(1, min(100, $perPage));

        return $q->paginate($perPage);
    }

    /** PATCH /api/notifications/{notification}/read  (mark single read) */
    public function markRead(Request $request, Notification $notification)
    {
        $this->authorizeNotification($request, $notification);

        if (!$notification->read_at) {
            $notification->forceFill(['read_at' => now()])->save();
        }

        return response()->json(['ok' => true, 'id' => $notification->id, 'read_at' => $notification->read_at]);
    }

    /** PATCH /api/notifications/read-all  (mark all read for current user) */
    public function markAllRead(Request $request)
    {
        $user = $request->user();
        Notification::query()
            ->where('recipient_id', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['ok' => true]);
    }

    /** DELETE /api/notifications/{notification} */
    public function destroy(Request $request, Notification $notification)
    {
        $this->authorizeNotification($request, $notification);
        $notification->delete();

        return response()->json(['ok' => true]);
    }

    /** GET /api/notification-preferences */
    public function getPreferences(Request $request)
    {
        $user = $request->user();

        $prefs = NotificationPreference::firstOrCreate(
            ['user_id' => $user->id],
            ['in_app' => true, 'email' => false, 'sms' => false, 'types' => null]
        );

        return response()->json($prefs);
    }

    /** PUT /api/notification-preferences */
    public function updatePreferences(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'in_app' => ['sometimes', 'boolean'],
            'email'  => ['sometimes', 'boolean'],
            'sms'    => ['sometimes', 'boolean'],
            // Optional per-type channel overrides, arbitrary structure you define in UI
            'types'  => ['sometimes', 'array'],
        ]);

        $prefs = NotificationPreference::firstOrCreate(
            ['user_id' => $user->id],
            ['in_app' => true, 'email' => false, 'sms' => false, 'types' => null]
        );

        $prefs->fill($data)->save();

        return response()->json($prefs);
    }

    // ────────────────────────────────────────────────────────────────

    protected function authorizeNotification(Request $request, Notification $notification): void
    {
        if ((int) $notification->recipient_id !== (int) $request->user()->id) {
            abort(403, 'Not allowed');
        }
    }
}