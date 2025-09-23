<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Create the table if it doesn't exist
        if (!Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('phone')->nullable();
                $table->boolean('notification_opt_in')->default(true);
                $table->timestamps();
            });
            return;
        }

        // Otherwise, add any missing columns
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'user_id')) {
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            }
            if (!Schema::hasColumn('customers', 'phone')) {
                $table->string('phone')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('customers', 'notification_opt_in')) {
                $table->boolean('notification_opt_in')->default(true)->after('phone');
            }
        });
    }

    public function down(): void
    {
        // No destructive down to avoid accidental data loss.
        // Implement targeted drops only if you really need rollbacks later.
    }
};