<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class InventoryTransaction extends Model
{
    use HasFactory;

    // type: capacity, add, remove, adjustment
    protected $fillable = [
        'product_variant_id','type','quantity','notes','effective_date'
    ];

    protected $casts = ['effective_date' => 'date'];

    public function variant() { return $this->belongsTo(ProductVariant::class, 'product_variant_id'); }
}