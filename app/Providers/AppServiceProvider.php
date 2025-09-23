<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
// use Illuminate\Support\Facades\Schema;
// use Illuminate\Database\Eloquent\Relations\Relation;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bindings, singletons, etc.
    }

    public function boot(): void
    {
        // If you had code in TWO boot() methods, merge it here.

        // Example things you might have had; uncomment if you use them:
        // Schema::defaultStringLength(191);

        // Relation::enforceMorphMap([
        //     'user'    => \App\Models\User::class,
        //     'vendor'  => \App\Models\Vendor::class,
        //     'product' => \App\Models\Product::class,
        // ]);
    }
}