<?php
// database/migrations/xxxx_xx_xx_xxxxxx_add_quantity_to_product_variants.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->unsignedInteger('quantity_per_unit')->nullable()->after('name');
            $table->string('unit_label', 32)->nullable()->after('quantity_per_unit');
            $table->integer('sort_order')->default(0)->after('active');
        });
    }
    public function down(): void {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->dropColumn(['quantity_per_unit','unit_label','sort_order']);
        });
    }
};