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
        'active',
        'phone',
        'stripe_account_id', // optional if/when we connect payouts
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    // Relationships
    public function users()
    {
        return $this->belongsToMany(User::class, 'vendor_users')->withPivot('role')->withTimestamps();
    }

    public function products()
    {
        return $this->hasMany(Product::class);
    }

    public function locations()
    {
        return $this->belongsToMany(Location::class, 'vendor_locations')->withTimestamps();
    }

    public function subscriptions()
    {
        return $this->hasMany(Subscription::class);
    }

    public function customers()
    {
        return $this->hasManyThrough(Customer::class, Subscription::class, 'vendor_id', 'id', 'id', 'customer_id')->distinct();
    }
}