<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            if (!Schema::hasColumn('products', 'image_path')) {
                $t->string('image_path')->nullable()->after('unit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $t) {
            if (Schema::hasColumn('products', 'image_path')) {
                $t->dropColumn('image_path');
            }
        });
    }
};