<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $t) {
                $t->id();
                $t->foreignId('user_id')->constrained()->cascadeOnDelete();
                $t->enum('type', ['email','sms','push']);
                $t->string('template_key',128);
                $t->string('channel_to');
                $t->json('payload')->nullable();
                $t->enum('status', ['queued','sent','failed'])->default('queued')->index();
                $t->dateTime('sent_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('qr_links')) {
            Schema::create('qr_links', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->unsignedBigInteger('subscription_plan_id')->nullable();
                $t->string('code',64)->unique();
                $t->string('target_url',1024);
                $t->boolean('active')->default(true);
                $t->timestamps();

                $t->foreign('subscription_plan_id')->references('id')->on('subscription_plans')->nullOnDelete();
                $t->index('vendor_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('qr_links');
        Schema::dropIfExists('notifications');
    }
};