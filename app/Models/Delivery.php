<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Delivery extends Model
{
    use HasFactory;

    // status: scheduled, ready, picked_up, missed, refunded
    protected $fillable = [
        'subscription_id','location_id','due_date','status','quantity'
    ];

    protected $casts = ['due_date' => 'date'];

    public function subscription() { return $this->belongsTo(Subscription::class); }
    public function location()     { return $this->belongsTo(Location::class); }
}