<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Make email nullable so phone-only users can exist
            $table->string('email')->nullable()->change();

            // Add phone, unique but nullable
            if (! Schema::hasColumn('users', 'phone')) {
                $table->string('phone')->nullable()->unique()->after('email');
            }
        });

        // Optional backfill: if you already saved phone on customers, copy to users where missing.
        if (Schema::hasTable('customers')) {
            DB::statement("
                UPDATE users u
                JOIN customers c ON c.user_id = u.id
                SET u.phone = c.phone
                WHERE u.phone IS NULL AND c.phone IS NOT NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Revert ONLY if you’re sure no null emails remain; otherwise this will fail.
            // $table->string('email')->nullable(false)->change();

            if (Schema::hasColumn('users', 'phone')) {
                $table->dropUnique(['phone']);
                $table->dropColumn('phone');
            }
        });
    }
};