<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('product_variants')) {
            Schema::create('product_variants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->string('sku')->unique();
                $table->string('name')->nullable();
                $table->integer('price_cents')->default(0);
                $table->string('currency', 3)->default('USD');
                $table->boolean('active')->default(true)->index();
                $table->timestamps();
            });
            return;
        }

        Schema::table('product_variants', function (Blueprint $table) {
            if (!Schema::hasColumn('product_variants', 'product_id')) {
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            }
            if (!Schema::hasColumn('product_variants', 'sku')) {
                $table->string('sku')->unique()->after('product_id');
            }
            if (!Schema::hasColumn('product_variants', 'name')) {
                $table->string('name')->nullable()->after('sku');
            }
            if (!Schema::hasColumn('product_variants', 'price_cents')) {
                $table->integer('price_cents')->default(0)->after('name');
            }
            if (!Schema::hasColumn('product_variants', 'currency')) {
                $table->string('currency', 3)->default('USD')->after('price_cents');
            }
            if (!Schema::hasColumn('product_variants', 'active')) {
                $table->boolean('active')->default(true)->index()->after('currency');
            }
        });
    }

    public function down(): void
    {
        // Non-destructive down: don’t drop table/columns in case other data exists.
        // If you really want to roll this back, you can implement targeted drops.
    }
};