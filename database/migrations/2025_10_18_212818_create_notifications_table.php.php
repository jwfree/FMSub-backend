<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('recipient_id')->index(); // who sees it
            $table->unsignedBigInteger('actor_id')->nullable()->index(); // who triggered it (system or user)
            $table->string('type', 100)->index(); // e.g. subscription.created
            $table->string('title', 200);
            $table->text('body')->nullable();
            $table->json('data')->nullable();     // deep link, ids, etc.
            $table->timestamp('read_at')->nullable()->index();
            $table->timestamps();

            $table->foreign('recipient_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::dropIfExists('notifications');
    }
};