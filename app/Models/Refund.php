<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Refund extends Model
{
    use HasFactory;

    protected $fillable = [
        'payment_id','amount_cents','provider_refund_id','reason','processed_at'
    ];

    protected $casts = ['processed_at' => 'datetime'];

    public function payment() { return $this->belongsTo(Payment::class); }
}