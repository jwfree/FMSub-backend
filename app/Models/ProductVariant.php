<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductVariant extends Model
{
    use HasFactory;

protected $fillable = [
  'product_id','sku','name','price_cents','currency','active',
  'quantity_per_unit','unit_label','sort_order'
];

public function product() {
  return $this->belongsTo(Product::class);
}

// app/Models/Product.php
public function variants() {
  return $this->hasMany(ProductVariant::class)->orderBy('sort_order')->orderBy('id');
}

}