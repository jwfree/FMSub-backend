<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'name',
        'sku',
        'price_cents',
    ];

    protected $casts = [
        'price_cents' => 'integer',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}