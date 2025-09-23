<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add missing vendor contact/media columns IF they don't already exist.
        if (! Schema::hasColumn('vendors', 'contact_phone')
            || ! Schema::hasColumn('vendors', 'banner_path')
            || ! Schema::hasColumn('vendors', 'photo_path')) {

            Schema::table('vendors', function (Blueprint $table) {
                if (! Schema::hasColumn('vendors', 'contact_phone')) {
                    $table->string('contact_phone')->nullable()->after('contact_email');
                }
                if (! Schema::hasColumn('vendors', 'banner_path')) {
                    $table->string('banner_path')->nullable()->after('contact_phone');
                }
                if (! Schema::hasColumn('vendors', 'photo_path')) {
                    $table->string('photo_path')->nullable()->after('banner_path');
                }
            });
        }
    }

    public function down(): void
    {
        // Drop only columns that exist.
        Schema::table('vendors', function (Blueprint $table) {
            if (Schema::hasColumn('vendors', 'photo_path')) {
                $table->dropColumn('photo_path');
            }
            if (Schema::hasColumn('vendors', 'banner_path')) {
                $table->dropColumn('banner_path');
            }
            if (Schema::hasColumn('vendors', 'contact_phone')) {
                $table->dropColumn('contact_phone');
            }
        });
    }
};