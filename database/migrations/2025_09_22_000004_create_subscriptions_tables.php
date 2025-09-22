<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('subscription_plans')) {
            Schema::create('subscription_plans', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->foreignId('product_id')->constrained()->cascadeOnDelete();
                $t->unsignedBigInteger('product_variant_id')->nullable();
                $t->string('name');
                $t->enum('frequency', ['weekly','biweekly','monthly']);
                $t->integer('price_cents');
                $t->enum('billing_mode', ['per_delivery','prepaid_cycle'])->default('per_delivery');
                $t->integer('min_commitments')->nullable();
                $t->integer('max_subscribers')->nullable();
                $t->unsignedBigInteger('pickup_vendor_location_id')->nullable();
                $t->integer('lead_time_days')->default(0);
                $t->boolean('active')->default(true);
                $t->timestamps();

                $t->index(['vendor_id','active']);
                $t->foreign('product_variant_id')->references('id')->on('product_variants')->nullOnDelete();
                $t->foreign('pickup_vendor_location_id')->references('id')->on('vendor_locations')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('subscriptions')) {
            Schema::create('subscriptions', function (Blueprint $t) {
                $t->id();
                $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->foreignId('subscription_plan_id')->constrained()->cascadeOnDelete();
                $t->enum('status', ['active','paused','canceled','completed'])->default('active')->index();
                $t->date('start_date');
                $t->date('end_date')->nullable();
                $t->date('next_delivery_date')->nullable();
                $t->integer('qty')->default(1);
                $t->string('stripe_customer_id')->nullable();
                $t->string('stripe_subscription_id')->nullable();
                $t->timestamps();

                $t->index(['customer_id','status']);
                $t->index(['vendor_id','status']);
            });
        }

        if (!Schema::hasTable('subscription_pauses')) {
            Schema::create('subscription_pauses', function (Blueprint $t) {
                $t->id();
                $t->foreignId('subscription_id')->constrained()->cascadeOnDelete();
                $t->date('start_date');
                $t->date('end_date');
                $t->text('reason')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('subscription_cancellations')) {
            Schema::create('subscription_cancellations', function (Blueprint $t) {
                $t->id();
                $t->foreignId('subscription_id')->constrained()->cascadeOnDelete();
                $t->dateTime('canceled_at');
                $t->text('reason')->nullable();
                $t->integer('refunded_amount_cents')->default(0);
                $t->timestamps();

                $t->unique('subscription_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_cancellations');
        Schema::dropIfExists('subscription_pauses');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('subscription_plans');
    }
};