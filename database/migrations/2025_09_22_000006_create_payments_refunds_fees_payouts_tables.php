<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('payments')) {
            Schema::create('payments', function (Blueprint $t) {
                $t->id();
                $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->unsignedBigInteger('subscription_id')->nullable();
                $t->unsignedBigInteger('delivery_id')->nullable();
                $t->integer('amount_cents');
                $t->char('currency',3)->default('usd');
                $t->enum('status', ['requires_payment_method','succeeded','refunded','failed'])->default('requires_payment_method')->index();
                $t->string('stripe_payment_intent_id')->nullable();
                $t->string('stripe_checkout_session_id')->nullable();
                $t->timestamps();

                $t->index('subscription_id');
                $t->index('delivery_id');

                $t->foreign('subscription_id')->references('id')->on('subscriptions')->nullOnDelete();
                $t->foreign('delivery_id')->references('id')->on('deliveries')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('refunds')) {
            Schema::create('refunds', function (Blueprint $t) {
                $t->id();
                $t->foreignId('payment_id')->constrained()->cascadeOnDelete();
                $t->integer('amount_cents');
                $t->text('reason')->nullable();
                $t->string('stripe_refund_id')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('fees')) {
            Schema::create('fees', function (Blueprint $t) {
                $t->id();
                $t->foreignId('payment_id')->constrained('payments')->cascadeOnDelete();
                $t->decimal('percent',5,2);
                $t->integer('fixed_cents')->default(0);
                $t->integer('calculated_cents');
                $t->timestamps();

                $t->unique('payment_id');
            });
        }

        if (!Schema::hasTable('payouts')) {
            Schema::create('payouts', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->integer('amount_cents');
                $t->enum('status', ['pending','in_transit','paid','failed'])->default('pending')->index();
                $t->date('payout_date')->nullable();
                $t->string('stripe_transfer_id')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('payout_items')) {
            Schema::create('payout_items', function (Blueprint $t) {
                $t->id();
                $t->foreignId('payout_id')->constrained()->cascadeOnDelete();
                $t->foreignId('payment_id')->constrained()->cascadeOnDelete();
                $t->integer('net_amount_cents');
                $t->timestamps();

                $t->index('payment_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_items');
        Schema::dropIfExists('payouts');
        Schema::dropIfExists('fees');
        Schema::dropIfExists('refunds');
        Schema::dropIfExists('payments');
    }
};