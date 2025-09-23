<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        // Ensure column exists and is nullable
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'phone')) {
                $table->string('phone', 32)->nullable()->after('email');
            } else {
                $table->string('phone', 32)->nullable()->change();
            }
        });

        // Normalize: keep digits only (strip +, spaces, dashes, etc.)
        // We'll do it safely in PHP to work across MySQL versions.
        $users = DB::table('users')->select('id','phone')->whereNotNull('phone')->get();
        foreach ($users as $u) {
            $digits = preg_replace('/\D+/', '', $u->phone);
            if ($digits !== $u->phone) {
                DB::table('users')->where('id', $u->id)->update(['phone' => $digits ?: null]);
            }
        }

        // Add unique index if not present
        $hasIndex = collect(DB::select("SHOW INDEX FROM users"))->contains(function ($idx) {
            return $idx->Key_name === 'users_phone_unique';
        });

        if (!$hasIndex) {
            Schema::table('users', function (Blueprint $table) {
                $table->unique('phone', 'users_phone_unique');
            });
        }
    }

    public function down(): void
    {
        // Drop unique if exists (safe)
        try {
            Schema::table('users', function (Blueprint $table) {
                $table->dropUnique('users_phone_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }
};