<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('inventory_ledger', function (Blueprint $t) {
            $t->bigIncrements('id');

            $t->unsignedBigInteger('vendor_id');
            $t->unsignedBigInteger('vendor_location_id')->nullable();
            $t->unsignedBigInteger('product_id');
            $t->unsignedBigInteger('product_variant_id');

            $t->date('for_date'); // market date the stock is for

            // Signed quantity:
            //  +N = add stock
            //  -N = adjustment down (spoilage etc.)
            //  +N = adjustment up (found stock, correction)
            $t->integer('qty');

            $t->enum('entry_type', ['add','adjust'])->default('add');
            $t->string('note', 500)->nullable();

            $t->unsignedBigInteger('created_by')->nullable();

            $t->timestamps();

            $t->index(['vendor_id', 'for_date']);
            $t->index(['vendor_location_id', 'for_date']);
            $t->index(['product_variant_id', 'for_date']);

            $t->foreign('vendor_id')->references('id')->on('vendors')->onDelete('cascade');
            $t->foreign('vendor_location_id')->references('id')->on('vendor_locations')->onDelete('set null');
            $t->foreign('product_id')->references('id')->on('products')->onDelete('cascade');
            $t->foreign('product_variant_id')->references('id')->on('product_variants')->onDelete('cascade');
        });
    }

    public function down(): void {
        Schema::dropIfExists('inventory_ledger');
    }
};