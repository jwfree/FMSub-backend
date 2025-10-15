<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddShelfLifeDaysToInventoryLedger extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_ledger', function (Blueprint $table) {
            // add column only if missing (safe re-run)
            if (!Schema::hasColumn('inventory_ledger', 'shelf_life_days')) {
                $table->unsignedSmallInteger('shelf_life_days')
                      ->nullable()
                      ->after('entry_type');
            }
        });

        // add index (separate call avoids "changing columns with index" edge cases)
        Schema::table('inventory_ledger', function (Blueprint $table) {
            // will no-op if it already exists on most MySQL versions; otherwise rerun after rollback
            $table->index(
                ['product_variant_id', 'for_date', 'shelf_life_days'],
                'il_variant_date_life_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('inventory_ledger', function (Blueprint $table) {
            // drop index then column (wrap in try in case index name isn’t present)
            try {
                $table->dropIndex('il_variant_date_life_idx');
            } catch (\Throwable $e) {
                // ignore
            }

            if (Schema::hasColumn('inventory_ledger', 'shelf_life_days')) {
                $table->dropColumn('shelf_life_days');
            }
        });
    }
}