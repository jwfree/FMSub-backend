<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'contact_email',
        'contact_phone',
        'banner_path',
        'photo_path',
        'active',
    ];

    /** Users attached to this vendor (via vendor_users pivot) */
    public function users()
    {
        return $this->belongsToMany(User::class, 'vendor_users')->withPivot('role');
    }

    /** Products sold by this vendor */
    public function products()
    {
        return $this->hasMany(Product::class);
    }

    /** Pickup locations for this vendor */
    public function locations()
    {
        return $this->hasMany(Location::class);
    }
}