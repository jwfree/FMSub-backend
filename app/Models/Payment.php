<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Payment extends Model
{
    use HasFactory;

    // status: pending, succeeded, failed, refunded, partially_refunded
    protected $fillable = [
        'subscription_id','customer_id','vendor_id',
        'provider','provider_payment_id',
        'amount_cents','currency','status','captured_at'
    ];

    protected $casts = ['captured_at' => 'datetime'];

    public function subscription() { return $this->belongsTo(Subscription::class); }
    public function customer()     { return $this->belongsTo(Customer::class); }
    public function vendor()       { return $this->belongsTo(Vendor::class); }

    public function refunds()      { return $this->hasMany(Refund::class); }
    public function platformFees() { return $this->hasMany(PlatformFee::class); }
}