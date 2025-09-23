<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('subscriptions', 'quantity')) {
                $table->unsignedInteger('quantity')->default(1)->after('status');
            }
        });

        // Copy data from qty -> quantity if both exist
        if (Schema::hasColumn('subscriptions', 'qty') && Schema::hasColumn('subscriptions', 'quantity')) {
            DB::table('subscriptions')->update([
                'quantity' => DB::raw('COALESCE(qty, 1)')
            ]);
        }

        // Drop the old column if present
        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('subscriptions', 'qty')) {
                $table->dropColumn('qty');
            }
        });
    }

    public function down(): void
    {
        // Recreate qty (default 1), copy back from quantity, drop quantity
        Schema::table('subscriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('subscriptions', 'qty')) {
                $table->unsignedInteger('qty')->default(1)->after('status');
            }
        });

        if (Schema::hasColumn('subscriptions', 'qty') && Schema::hasColumn('subscriptions', 'quantity')) {
            DB::table('subscriptions')->update([
                'qty' => DB::raw('COALESCE(quantity, 1)')
            ]);
        }

        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('subscriptions', 'quantity')) {
                $table->dropColumn('quantity');
            }
        });
    }
};