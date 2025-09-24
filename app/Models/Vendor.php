<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

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

    // Include computed URLs in JSON
    protected $appends = ['banner_url', 'photo_url'];

    // Hide raw paths if you prefer (optional)
    // protected $hidden = ['banner_path', 'photo_path'];

    // Relations
    public function users()
    {
        return $this->belongsToMany(User::class, 'vendor_users')->withPivot('role');
    }

    public function products()
    {
        return $this->hasMany(Product::class);
    }

    public function locations()
    {
        return $this->belongsToMany(Location::class, 'vendor_locations', 'vendor_id', 'location_id');
    }

    // Accessors
    public function getBannerUrlAttribute(): ?string
    {
        return $this->banner_path ? url(Storage::url($this->banner_path)) : null;
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? url(Storage::url($this->photo_path)) : null;
    }
}