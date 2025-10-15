<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserAddress extends Model
{
    protected $table = 'user_addresses';

    protected $fillable = [
        'user_id',
        'label',              // e.g. "Home", "Work"
        'name',               // optional recipient name
        'line1',
        'line2',
        'city',
        'region',             // state / province
        'postal_code',
        'country_code',       // ISO-2, e.g. "US"
        'phone',
        'instructions',       // delivery notes
        'is_default',         // bool
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    // Relations
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}