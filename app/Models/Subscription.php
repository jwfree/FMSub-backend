<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Subscription extends Model
{
    use HasFactory;

 // app/Models/Subscription.php
    protected $fillable = [
    'customer_id','vendor_id','product_id','product_variant_id',
    'status','start_date','end_date','frequency','notes','quantity'
    ];
    
    protected $with = [
        'product',
        'productVariant',
        'vendor',
    ];

    protected $casts = [
        'start_date' => 'date',
        'quantity'   => 'integer', 
        'end_date'   => 'date',
    ];

    // ----- Relationships -----

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function productVariant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    // ----- Scopes / helpers -----

    public function scopeActive($q)   { return $q->where('status', 'active'); }
    public function scopePaused($q)   { return $q->where('status', 'paused'); }
    public function scopeCanceled($q) { return $q->where('status', 'canceled'); }

    public function isActive(): bool   { return $this->status === 'active'; }
    public function isPaused(): bool   { return $this->status === 'paused'; }
    public function isCanceled(): bool { return $this->status === 'canceled'; }
}