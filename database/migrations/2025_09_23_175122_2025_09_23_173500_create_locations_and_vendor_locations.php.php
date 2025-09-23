<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Create locations only if it doesn't exist
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

        // Create pivot table only if it doesn't exist
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

                $t->unique(['vendor_id','location_id']); // optional but useful
            });
        }

        // Optionally add FK on customers.default_location_id if both columns exist
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'default_location_id')) {
            // Guard against duplicate FK errors by trying to add only if missing
            try {
                Schema::table('customers', function (Blueprint $t) {
                    $t->foreign('default_location_id')
                      ->references('id')->on('locations')
                      ->nullOnDelete();
                });
            } catch (\Throwable $e) {
                // FK probably already exists; ignore
            }
        }
    }

    public function down(): void
    {
        // Drop FK if present
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'default_location_id')) {
            try {
                Schema::table('customers', function (Blueprint $t) {
                    $t->dropForeign(['default_location_id']);
                });
            } catch (\Throwable $e) {}
        }

        Schema::dropIfExists('vendor_locations');
        Schema::dropIfExists('locations');
    }
};