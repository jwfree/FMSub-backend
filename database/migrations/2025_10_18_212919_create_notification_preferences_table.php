<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->unique();
            // channel toggles
            $table->boolean('in_app')->default(true);
            $table->boolean('email')->default(false);
            $table->boolean('sms')->default(false);
            // per-type toggles (extend as you need)
            $table->boolean('sub_created')->default(true);
            $table->boolean('sub_paused')->default(true);
            $table->boolean('sub_canceled')->default(true);
            $table->boolean('stock_alerts')->default(true);
            $table->boolean('delivery_changes')->default(true);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
    public function down(): void {
        Schema::dropIfExists('notification_preferences');
    }
};