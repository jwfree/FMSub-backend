<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $fillable = ['name','email','password','role', 'phone'];

    protected $hidden = ['password','remember_token'];

    protected $casts = [
        'email_verified_at' => 'datetime',
    ];

    // A user can belong to many vendors (with a role on the pivot)
    public function vendors()
    {
        return $this->belongsToMany(Vendor::class, 'vendor_users')
            ->withPivot('role')
            ->withTimestamps();
    }

    // If you’re treating customers as separate profiles
    public function customer()
    {
        return $this->hasOne(Customer::class);
    }

    public function favoriteVendors()
    {
        return $this->belongsToMany(Vendor::class, 'vendor_favorites')->withTimestamps();
    }
}