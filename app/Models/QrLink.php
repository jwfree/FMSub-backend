<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class QrLink extends Model
{
    use HasFactory;

    protected $fillable = [
        'vendor_id','product_id','subscription_plan_id','slug','target_url','expires_at'
    ];

    protected $casts = ['expires_at' => 'datetime'];

    public function vendor()  { return $this->belongsTo(Vendor::class); }
    public function product() { return $this->belongsTo(Product::class); }
}