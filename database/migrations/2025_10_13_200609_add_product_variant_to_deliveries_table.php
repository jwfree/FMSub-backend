<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            // Add after subscription_id for logical order
            if (!Schema::hasColumn('deliveries', 'product_id')) {
                $table->unsignedBigInteger('product_id')
                      ->nullable()
                      ->after('subscription_id');
            }

            if (!Schema::hasColumn('deliveries', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')
                      ->nullable()
                      ->after('product_id');
            }

            // Add foreign key references if relevant tables exist
            if (Schema::hasTable('products')) {
                $table->foreign('product_id')
                      ->references('id')
                      ->on('products')
                      ->onDelete('set null');
            }

            if (Schema::hasTable('product_variants')) {
                $table->foreign('product_variant_id')
                      ->references('id')
                      ->on('product_variants')
                      ->onDelete('set null');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            if (Schema::hasColumn('deliveries', 'product_variant_id')) {
                $table->dropForeign(['product_variant_id']);
                $table->dropColumn('product_variant_id');
            }

            if (Schema::hasColumn('deliveries', 'product_id')) {
                $table->dropForeign(['product_id']);
                $table->dropColumn('product_id');
            }
        });
    }
};