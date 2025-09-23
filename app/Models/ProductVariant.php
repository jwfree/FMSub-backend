<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'sku',             // e.g. EGG-12
        'name',            // e.g. "Dozen", "Half Dozen"
        'price_cents',     // store money as integer cents
        'currency',        // "USD"
        'stock_limit',     // optional per-period capacity
        'is_active',
    ];

    protected $casts = [
        'is_active'   => 'boolean',
        'price_cents' => 'integer',
        'stock_limit' => 'integer',
    ];

    // Relationships
    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function subscriptions()
    {
        return $this->hasMany(Subscription::class, 'product_variant_id');
    }

    // Convenience accessors
    public function getPriceAttribute(): float
    {
        return $this->price_cents / 100;
    }

    public function setPriceAttribute($value): void
    {
        $this->attributes['price_cents'] = (int) round(((float) $value) * 100);
    }
}