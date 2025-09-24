<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'vendor_id',
        'name',
        'description',
        'unit',
        'image_path',   // stored on public disk
        'active',       // boolean
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    protected $appends = [
        'image_url',    // expose full URL to the frontend
    ];

    /* ----------------- Relationships ----------------- */

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function variants()
    {
        return $this->hasMany(ProductVariant::class);
    }

    /* ----------------- Accessors ----------------- */

    public function getImageUrlAttribute(): ?string
    {
        if (!$this->image_path) return null;

        // Treat as storage path first
        if (Storage::disk('public')->exists($this->image_path)) {
            return asset('storage/'.$this->image_path);
        }

        // If it was already saved as an absolute URL
        if (filter_var($this->image_path, FILTER_VALIDATE_URL)) {
            return $this->image_path;
        }

        // Fallback: try to serve via storage symlink anyway
        return asset('storage/'.$this->image_path);
    }

    /* ----------------- Scopes ----------------- */

    public function scopeActive($q)
    {
        return $q->where('active', true);
    }
}