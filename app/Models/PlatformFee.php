<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class PlatformFee extends Model
{
    use HasFactory;

    protected $fillable = [
        'payment_id','amount_cents','percent','description'
    ];

    public function payment() { return $this->belongsTo(Payment::class); }
}