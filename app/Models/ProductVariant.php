<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'sku',
        'name',
        'unit_name',
        'unit_quantity',
        'price_cents',
        'active',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}