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
        // Make sure the policies above are registered
        $this->registerPolicies();
    }
}