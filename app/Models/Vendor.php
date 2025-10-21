<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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

    protected $casts = [
        'active' => 'bool',
    ];

    /**
     * Ensure these computed attributes are included in arrays/JSON.
     */
    protected $appends = [
        'banner_url',
        'photo_url',
    ];

    // ──────────────────────────────────
    // Relationships
    // ──────────────────────────────────

    public function users()
    {
        return $this->belongsToMany(User::class, 'vendor_users')->withPivot('role');
    }

    public function products()
    {
        return $this->hasMany(Product::class);
    }

    // Many-to-many via pivot vendor_locations (vendor_id, location_id)
    public function locations()
    {
        return $this->belongsToMany(Location::class, 'vendor_locations', 'vendor_id', 'location_id');
    }

    public function favoritedBy()
    {
        return $this->belongsToMany(User::class, 'vendor_favorites')->withTimestamps();
    }

    // ──────────────────────────────────
    // Scopes
    // ──────────────────────────────────

    /** Only active vendors. */
    public function scopeActive($q)
    {
        return $q->where('vendors.active', true);
    }

    /** Case-insensitive name search. */
    public function scopeSearch($q, ?string $term)
    {
        $term = trim((string) $term);
        if ($term === '') return $q;
        return $q->where('vendors.name', 'like', "%{$term}%");
    }

    /** Vendors favorited by a specific user id. */
    public function scopeFavoritesFor($q, ?int $userId)
    {
        if (!$userId) return $q->whereRaw('1=0'); // no user => no favorites
        return $q->whereIn('vendors.id', function ($sub) use ($userId) {
            $sub->from('vendor_favorites')
                ->select('vendor_id')
                ->where('user_id', $userId);
        });
    }

    /**
     * Nearby vendors using Haversine (miles).
     * Joins vendor_locations -> locations (not locations.vendor_id).
     */
    public function scopeNearby($q, float $lat, float $lng, float $radiusMiles = 10.0)
    {
        // join through pivot to locations
        $q->join('vendor_locations as vl', 'vl.vendor_id', '=', 'vendors.id')
          ->join('locations as l', 'l.id', '=', 'vl.location_id')
          ->whereNotNull('l.latitude')
          ->whereNotNull('l.longitude');

        $expr = "(3959 * acos( cos(radians(?)) * cos(radians(l.latitude)) * " .
                "cos(radians(l.longitude) - radians(?)) + sin(radians(?)) * sin(radians(l.latitude)) ))";

        // select vendors.* plus computed distance
        $q->addSelect('vendors.*')
          ->addSelect(DB::raw($expr . ' as distance_miles'))
          // add bindings for the raw expression (keep existing first)
          ->setBindings(array_merge($q->getBindings(), [$lat, $lng, $lat]))
          ->having('distance_miles', '<=', $radiusMiles)
          ->groupBy('vendors.id')
          ->orderBy('distance_miles', 'asc');

        return $q;
    }

    // ──────────────────────────────────
    // Accessors (appended)
    // ──────────────────────────────────

    /**
     * Absolute URL to the vendor photo (falls back to default).
     * e.g. https://fmreserve.com/storage/… or /images/vendor-photo-default.jpg
     */
    public function getPhotoUrlAttribute(): string
    {
        return $this->photo_path
            ? url(Storage::url($this->photo_path))
            : asset('images/vendor-photo-default.jpg');
    }

    /**
     * Absolute URL to the vendor banner (falls back to default).
     */
    public function getBannerUrlAttribute(): string
    {
        return $this->banner_path
            ? url(Storage::url($this->banner_path))
            : asset('images/vendor-banner-default.jpg');
    }
}