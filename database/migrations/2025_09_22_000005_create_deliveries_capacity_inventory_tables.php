<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('deliveries')) {
            Schema::create('deliveries', function (Blueprint $t) {
                $t->id();
                $t->foreignId('subscription_id')->constrained()->cascadeOnDelete();
                $t->date('scheduled_date')->index();
                $t->enum('status', ['scheduled','ready','picked_up','skipped','missed','refunded'])->default('scheduled')->index();
                $t->foreignId('vendor_location_id')->constrained()->restrictOnDelete();
                $t->integer('qty')->default(1);
                $t->integer('unit_price_cents');
                $t->integer('total_price_cents');
                $t->dateTime('checked_in_at')->nullable();
                $t->timestamps();

                $t->index(['vendor_location_id','scheduled_date']);
            });
        }

        if (!Schema::hasTable('capacity_reservations')) {
            Schema::create('capacity_reservations', function (Blueprint $t) {
                $t->id();
                $t->foreignId('subscription_plan_id')->constrained()->cascadeOnDelete();
                $t->date('date');
                $t->integer('reserved_qty')->default(0);
                $t->timestamps();

                $t->unique(['subscription_plan_id','date']);
            });
        }

        if (!Schema::hasTable('vendor_inventory_events')) {
            Schema::create('vendor_inventory_events', function (Blueprint $t) {
                $t->id();
                $t->foreignId('vendor_id')->constrained()->cascadeOnDelete();
                $t->foreignId('product_id')->constrained()->cascadeOnDelete();
                $t->integer('change');
                $t->enum('reason', ['delivery_allocation','manual_adjustment','spoiled','other'])->default('other');
                $t->date('date');
                $t->dateTime('created_at')->nullable();

                $t->index('date');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_inventory_events');
        Schema::dropIfExists('capacity_reservations');
        Schema::dropIfExists('deliveries');
    }
};