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
        'lat',
        'lng',
        'notes',
        'active',
    ];

    public function vendors()
    {
        return $this->belongsToMany(Vendor::class, 'vendor_locations')->withTimestamps();
    }
}