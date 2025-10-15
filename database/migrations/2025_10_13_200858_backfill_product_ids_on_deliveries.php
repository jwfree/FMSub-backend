<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Optional: add indexes (cheap performance win)
        Schema::table('deliveries', function (Blueprint $table) {
            if (!Schema::hasColumn('deliveries', 'product_id')) {
                // If you didn't run the previous migration yet, bail early.
                return;
            }
            if (!Schema::hasIndex('deliveries', 'deliveries_product_id_index')) {
                $table->index('product_id');
            }
            if (!Schema::hasIndex('deliveries', 'deliveries_product_variant_id_index')) {
                $table->index('product_variant_id');
            }
        });

        // ---- MySQL/MariaDB backfill in one shot ----
        // Pull product/variant from subscriptions; if product_id missing there,
        // derive it via product_variants.product_id.
        try {
            DB::statement("
                UPDATE deliveries d
                LEFT JOIN subscriptions s
                       ON s.id = d.subscription_id
                LEFT JOIN product_variants pv
                       ON pv.id = s.product_variant_id
                SET
                    d.product_variant_id = COALESCE(s.product_variant_id, d.product_variant_id),
                    d.product_id         = COALESCE(s.product_id, pv.product_id, d.product_id)
                WHERE (d.product_variant_id IS NULL OR d.product_id IS NULL)
            ");
        } catch (\Throwable $e) {
            // If your DB driver doesn't allow multi-table UPDATEs, do a portable fallback.
            $this->eloquentFallback();
        }
    }

    public function down(): void
    {
        // No-op: this migration only backfills data + indexes.
        // (Indexes will be dropped if you roll back the previous migration.)
    }

    /**
     * Portable (slower) backfill using Eloquent/Query Builder.
     */
    private function eloquentFallback(): void
    {
        // chunk to avoid large memory spikes
        DB::table('deliveries')
            ->select(['id','subscription_id','product_id','product_variant_id'])
            ->where(function ($q) {
                $q->whereNull('product_id')->orWhereNull('product_variant_id');
            })
            ->orderBy('id')
            ->chunkById(1000, function ($rows) {
                // preload subscriptions
                $subIds = collect($rows)->pluck('subscription_id')->unique()->filter()->all();
                $subs   = DB::table('subscriptions')
                    ->whereIn('id', $subIds)->get()
                    ->keyBy('id');

                // preload variants to derive product_id when subs lack it
                $variantIds = $subs->pluck('product_variant_id')->unique()->filter()->all();
                $variants   = DB::table('product_variants')
                    ->whereIn('id', $variantIds)->get()
                    ->keyBy('id');

                foreach ($rows as $r) {
                    $sub = $subs[$r->subscription_id] ?? null;
                    if (!$sub) continue;

                    $newVariantId = $sub->product_variant_id ?? $r->product_variant_id;
                    $newProductId = $sub->product_id
                        ?? ($newVariantId ? ($variants[$newVariantId]->product_id ?? null) : null)
                        ?? $r->product_id;

                    if ($newVariantId || $newProductId) {
                        DB::table('deliveries')
                            ->where('id', $r->id)
                            ->update([
                                'product_variant_id' => $newVariantId,
                                'product_id'         => $newProductId,
                            ]);
                    }
                }
            });
    }
};