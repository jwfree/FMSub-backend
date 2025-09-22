<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('locations')) {
            Schema::create('locations', function (Blueprint $t) {
                $t->id();
                $t->string('label');
                $t->string('address_line1')->nullable();
                $t->string('address_line2')->nullable();
                $t->string('city',128)->nullable();
                $t->string('region',128)->nullable();
                $t->string('postal_code',32)->nullable();
                $t->string('country',2)->nullable(); // ISO-3166-1 alpha-2
                $t->decimal('latitude',10,7)->nullable()->index();
                $t->decimal('longitude',10,7)->nullable()->index();
                $t->text('notes')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('vendor_locations')) {
            Schema::create('vendor_locations', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->foreignId('location_id')->constrained()->cascadeOnDelete();
                $t->unsignedTinyInteger('weekday_mask')->default(0);
                $t->time('open_time')->nullable();
                $t->time('close_time')->nullable();
                $t->boolean('active')->default(true);
                $t->timestamps();
            });
        }

        // add FK for customers.default_location_id now that 'locations' exists
        if (Schema::hasTable('customers') && !Schema::hasColumn('customers', 'fk_default_location_added')) {
            Schema::table('customers', function (Blueprint $t) {
                if (!Schema::hasColumn('customers','default_location_id')) return;
                $t->foreign('default_location_id')->references('id')->on('locations')->nullOnDelete();
                // tiny marker column to avoid re-adding FK on re-run
                $t->boolean('fk_default_location_added')->default(true);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $t) {
                try { $t->dropForeign(['default_location_id']); } catch (\Throwable $e) {}
                if (Schema::hasColumn('customers','fk_default_location_added')) {
                    $t->dropColumn('fk_default_location_added');
                }
            });
        }
        Schema::dropIfExists('vendor_locations');
        Schema::dropIfExists('locations');
    }
};