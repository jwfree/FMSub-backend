<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Notification extends Model
{
    use HasFactory;

    // channel: email, sms, push | type: reminder, update, marketing
    protected $fillable = [
        'user_id','channel','type','title','body','sent_at','meta'
    ];

    protected $casts = [
        'sent_at' => 'datetime',
        'meta' => 'array',
    ];

    public function user() { return $this->belongsTo(User::class); }
}