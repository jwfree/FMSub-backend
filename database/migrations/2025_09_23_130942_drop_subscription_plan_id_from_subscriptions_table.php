<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('subscriptions', 'subscription_plan_id')) {
            return; // already gone
        }

        // 1) Find the actual FK constraint name (if any)
        $row = DB::selectOne("
            SELECT CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'subscriptions'
              AND COLUMN_NAME = 'subscription_plan_id'
              AND REFERENCED_TABLE_NAME IS NOT NULL
            LIMIT 1
        ");

        if ($row && !empty($row->CONSTRAINT_NAME)) {
            $fk = $row->CONSTRAINT_NAME;
            try {
                DB::statement("ALTER TABLE `subscriptions` DROP FOREIGN KEY `{$fk}`");
            } catch (\Throwable $e) {
                // ignore if already dropped or name mismatch
            }
        }

        // 2) Drop any index on the column (some MySQLs create a separate index)
        $idx = DB::selectOne("
            SELECT INDEX_NAME
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'subscriptions'
              AND COLUMN_NAME = 'subscription_plan_id'
            LIMIT 1
        ");
        if ($idx && !empty($idx->INDEX_NAME)) {
            try {
                DB::statement("ALTER TABLE `subscriptions` DROP INDEX `{$idx->INDEX_NAME}`");
            } catch (\Throwable $e) {
                // ignore if missing
            }
        }

        // 3) Finally drop the column
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('subscription_plan_id');
        });
    }

    public function down(): void
    {
        // Recreate as nullable to avoid blocking existing inserts
        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('subscriptions', 'subscription_plan_id')) {
                $table->foreignId('subscription_plan_id')
                    ->nullable()
                    ->constrained('subscription_plans')
                    ->cascadeOnUpdate()
                    ->nullOnDelete();
            }
        });
    }
};