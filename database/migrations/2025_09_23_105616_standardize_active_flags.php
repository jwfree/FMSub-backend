<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // ---- products ----
        if (Schema::hasTable('products')) {
            // Add active if missing
            if (!Schema::hasColumn('products', 'active')) {
                Schema::table('products', function (Blueprint $table) {
                    $table->boolean('active')->default(true)->after('unit');
                });
            }

            // If legacy is_active exists, copy data then drop it
            if (Schema::hasColumn('products', 'is_active')) {
                // copy values
                DB::statement('UPDATE products SET active = is_active');
                // drop old column
                Schema::table('products', function (Blueprint $table) {
                    $table->dropColumn('is_active');
                });
            }
        }

        // ---- product_variants ----
        if (Schema::hasTable('product_variants')) {
            if (!Schema::hasColumn('product_variants', 'active')) {
                Schema::table('product_variants', function (Blueprint $table) {
                    $table->boolean('active')->default(true)->after('unit_name');
                });
            }

            if (Schema::hasColumn('product_variants', 'is_active')) {
                DB::statement('UPDATE product_variants SET active = is_active');
                Schema::table('product_variants', function (Blueprint $table) {
                    $table->dropColumn('is_active');
                });
            }
        }
    }

    public function down(): void
    {
        // Roll back to legacy is_active if you ever need to
        if (Schema::hasTable('products')) {
            if (!Schema::hasColumn('products', 'is_active')) {
                Schema::table('products', function (Blueprint $table) {
                    $table->boolean('is_active')->default(true)->after('unit');
                });
            }
            if (Schema::hasColumn('products', 'active')) {
                DB::statement('UPDATE products SET is_active = active');
                Schema::table('products', function (Blueprint $table) {
                    $table->dropColumn('active');
                });
            }
        }

        if (Schema::hasTable('product_variants')) {
            if (!Schema::hasColumn('product_variants', 'is_active')) {
                Schema::table('product_variants', function (Blueprint $table) {
                    $table->boolean('is_active')->default(true)->after('unit_name');
                });
            }
            if (Schema::hasColumn('product_variants', 'active')) {
                DB::statement('UPDATE product_variants SET is_active = active');
                Schema::table('product_variants', function (Blueprint $table) {
                    $table->dropColumn('active');
                });
            }
        }
    }
};