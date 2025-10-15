<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaitlistEntry extends Model
{
    protected $fillable = [
        'vendor_id','product_id','product_variant_id','customer_id','qty','note',
    ];

    public function vendor()  { return $this->belongsTo(Vendor::class); }
    public function product() { return $this->belongsTo(Product::class); }
    public function variant() { return $this->belongsTo(ProductVariant::class, 'product_variant_id'); }
    public function customer(){ return $this->belongsTo(User::class, 'customer_id'); }
}