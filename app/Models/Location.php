<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    use HasFactory;

    protected $fillable = [
        'vendor_id',
        'name',
        'address1',
        'address2',
        'city',
        'state',
        'postal_code',
        'lat',
        'lng',
        'active',
    ];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }
}