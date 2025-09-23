<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Add price_cents if missing
        if (! Schema::hasColumn('product_variants', 'price_cents')) {
            Schema::table('product_variants', function (Blueprint $table) {
                $table->unsignedInteger('price_cents')->nullable()->after('sku');
            });
        }

        // 2) If an old "price" column exists (decimal or int), backfill price_cents = price * 100
        if (Schema::hasColumn('product_variants', 'price')) {
            // Try to multiply by 100 safely
            DB::statement("
                UPDATE product_variants
                SET price_cents = ROUND(price * 100)
                WHERE price_cents IS NULL AND price IS NOT NULL
            ");

            // 3) Drop old "price" column
            Schema::table('product_variants', function (Blueprint $table) {
                $table->dropColumn('price');
            });
        }

        // 4) Ensure price_cents is NOT NULL (set a default 0 for any stragglers)
        DB::statement("
            UPDATE product_variants
            SET price_cents = 0
            WHERE price_cents IS NULL
        ");

        Schema::table('product_variants', function (Blueprint $table) {
            $table->unsignedInteger('price_cents')->default(0)->change();
        });
    }

    public function down(): void
    {
        // Recreate a decimal "price" and backfill from price_cents (best-effort)
        Schema::table('product_variants', function (Blueprint $table) {
            $table->decimal('price', 10, 2)->nullable()->after('sku');
        });

        DB::statement("
            UPDATE product_variants
            SET price = price_cents / 100
            WHERE price_cents IS NOT NULL
        ");

        // We’ll leave both columns in the down migration (safer)
        // If you truly want to drop price_cents in down(), uncomment next block:
        // Schema::table('product_variants', function (Blueprint $table) {
        //     $table->dropColumn('price_cents');
        // });
    }
};