<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'address_line1',
        'address_line2',
        'city',
        'state',
        'postal_code',
        // add any other columns you actually have
    ];

    // Vendors that use this location
    public function vendors()
    {
        return $this->belongsToMany(Vendor::class, 'vendor_locations', 'location_id', 'vendor_id')
            ->withTimestamps();
    }
}