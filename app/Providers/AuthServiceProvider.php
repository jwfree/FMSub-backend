<?php

namespace App\Providers;

use App\Models\Vendor;
use App\Policies\VendorPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Vendor::class => VendorPolicy::class,
    ];

    public function boot(): void
    {
        // Nothing else needed – policies auto-register
    }
}