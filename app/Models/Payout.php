<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Payout extends Model
{
    use HasFactory;

    // status: pending, paid, failed
    protected $fillable = [
        'vendor_id','amount_cents','currency','status','provider_payout_id','paid_at'
    ];

    protected $casts = ['paid_at' => 'datetime'];

    public function vendor() { return $this->belongsTo(Vendor::class); }
}