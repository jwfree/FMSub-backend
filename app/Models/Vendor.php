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
        'active',
        'banner_path',
        'photo_path',
    ];

    protected $appends = [
        'banner_url',
        'photo_url',
    ];

    public function getBannerUrlAttribute(): ?string
    {
        return $this->banner_path ? Storage::disk('public')->url($this->banner_path) : null;
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null;
    }

    // relations you already have…
    // public function products(){ ... }
    // public function locations(){ ... }
    // public function users(){ ... }
}