<?php

// database/migrations/2025_10_21_000000_add_subscription_options_to_products.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('products', function (Blueprint $table) {
            $table->json('subscription_options')->nullable()->after('allow_waitlist');
        });
    }
    public function down(): void {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('subscription_options');
        });
    }
};