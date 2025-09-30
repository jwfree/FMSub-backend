<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryEntry extends Model
{
    protected $table = 'inventory_ledger';

    protected $fillable = [
        'vendor_id','vendor_location_id','product_id','product_variant_id',
        'for_date','qty','entry_type','note','created_by',
    ];

    protected $casts = [
        'for_date' => 'date',
        'qty'      => 'integer',
    ];
}