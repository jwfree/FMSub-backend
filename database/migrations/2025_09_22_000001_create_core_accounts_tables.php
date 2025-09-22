<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->string('email')->unique();
                $t->string('phone', 32)->nullable()->index();
                $t->string('password')->nullable();
                $t->enum('role', ['customer','vendor_owner','vendor_staff','admin'])->default('customer')->index();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('vendors')) {
            Schema::create('vendors', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->text('description')->nullable();
                $t->string('contact_email');
                $t->string('contact_phone', 32)->nullable();
                $t->string('stripe_account_id')->nullable();
                $t->boolean('active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('vendor_users')) {
            Schema::create('vendor_users', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->foreignId('user_id')->constrained()->cascadeOnDelete();
                $t->enum('role', ['owner','manager','staff'])->default('staff');
                $t->timestamps();
                $t->unique(['vendor_id','user_id']);
                $t->index('user_id');
            });
        }

        if (!Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $t) {
                $t->id();
                $t->foreignId('user_id')->constrained()->cascadeOnDelete();
                $t->unsignedBigInteger('default_location_id')->nullable();
                $t->boolean('sms_opt_in')->default(false);
                $t->boolean('marketing_opt_in')->default(false);
                $t->timestamps();

                $t->unique('user_id');
                $t->index('default_location_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
        Schema::dropIfExists('vendor_users');
        Schema::dropIfExists('vendors');
        // do not drop users; Laravel default uses it (comment out if needed)
        // Schema::dropIfExists('users');
    }
};