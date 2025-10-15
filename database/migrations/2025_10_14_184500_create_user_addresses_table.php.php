<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // Optional “nickname” like “Home”, “Work”
            $table->string('label', 80)->nullable();

            // Contact & address fields
            $table->string('recipient_name', 120)->nullable();
            $table->string('phone', 40)->nullable();

            $table->string('line1', 160);
            $table->string('line2', 160)->nullable();
            $table->string('city', 120);
            $table->string('state', 80)->nullable();
            $table->string('postal_code', 32);
            $table->string('country', 2)->default('US'); // ISO-2

            $table->boolean('is_default')->default(false);
            $table->string('instructions', 500)->nullable();

            $table->timestamps();

            $table->index(['user_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_addresses');
    }
};