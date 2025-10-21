<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class NotificationPreference extends Model
{
    use HasFactory;

    protected $table = 'notification_preferences';

    protected $fillable = [
        'user_id',
        'in_app',
        'email',
        'sms',
        'types', // optional JSON map of per-type channel prefs
    ];

    protected $casts = [
        'in_app' => 'boolean',
        'email'  => 'boolean',
        'sms'    => 'boolean',
        'types'  => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}