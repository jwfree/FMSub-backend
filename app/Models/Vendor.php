<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'flyer_text',
        'contact_email',
        'contact_phone',
        'banner_path',
        'photo_path',
        'active',
    ];

    // Users attached to this vendor
    public function users()
    {
        return $this->belongsToMany(User::class, 'vendor_users')->withPivot('role');
    }

    // Products owned by this vendor
    public function products()
    {
        return $this->hasMany(Product::class);
    }

    // LOCATIONS: many-to-many via pivot table vendor_locations
    public function locations()
    {
        return $this->belongsToMany(Location::class, 'vendor_locations', 'vendor_id', 'location_id');
    }

    /**
     * Customize array/json output.
     * Always include banner_url and photo_url with defaults if missing.
     */
    public function toArray()
    {
        $arr = parent::toArray();

        $arr['banner_url'] = $this->banner_path
            ? asset('storage/' . $this->banner_path)
            : asset('images/vendor-banner-default.jpg');

        $arr['photo_url'] = $this->photo_path
            ? asset('storage/' . $this->photo_path)
            : asset('images/vendor-photo-default.jpg');

        return $arr;
    }
}