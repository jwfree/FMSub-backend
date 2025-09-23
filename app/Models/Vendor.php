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
    protected $casts = [
        'active' => 'bool',
    ];

    public function scopeActive($q)
    {
        return $q->where('active', true);
    }
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
        return $this->belongsToMany(Location::class, 'vendor_locations', 'vendor_id', 'location_id')
            ->withTimestamps();
    }
    public function getContactPhoneFormattedAttribute(): ?string
    {
        if (!$this->contact_phone) return null;
        $digits = preg_replace('/\D+/', '', $this->contact_phone);
        if (strlen($digits) === 10) {
            return sprintf('(%s) %s-%s', substr($digits,0,3), substr($digits,3,3), substr($digits,6));
        }
        return $this->contact_phone; // fallback
    }
}