// web/src/pages/ProductDetail.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import Lightbox from "../components/Lightbox";

type Variant = {
  id: number;
  name: string;
  sku?: string;
  price_cents: number;
  is_active: boolean;
};

type Product = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  vendor?: { id: number; name: string };
  variants: Variant[];
  image_url?: string | null;
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // subscribe form
  const [variantId, setVariantId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number>(1);                 // NEW
  const [frequency, setFrequency] =
    useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // lightbox
  const [showImg, setShowImg] = useState(false);
  const [imgHidden, setImgHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Product>(`/products/${id}`)
      .then((r) => !cancelled && setProduct(r.data))
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (product && product.variants?.length && variantId === "") {
      setVariantId(product.variants[0].id);
    }
  }, [product, variantId]);

  async function onSubscribe() {
    if (!variantId || !startDate || quantity < 1) return;
    setSubmitting(true);
    try {
      await api.post("/subscriptions", {
        product_variant_id: Number(variantId),
        start_date: startDate,
        frequency,
        quantity,                              // NEW (backend can ignore if not used)
        notes: notes || undefined,
      });
      setToast("Subscription created!");
      navigate("/subscriptions");
      setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        window.location.href = `/account?next=/products/${id}`;
        return;
      }
      setToast(e?.response?.data?.message || "Failed to create subscription");
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-base-content/80">Loading…</div>;
  if (err || !product) return <div className="p-4 text-error">{err ?? "Not found"}</div>;

  const minPrice = Math.min(...(product.variants || []).map((v) => v.price_cents));
  const selected = product.variants.find(v => v.id === variantId);
  const unitPrice = selected?.price_cents ?? (Number.isFinite(minPrice) ? minPrice : undefined);
  const total = typeof unitPrice === "number" ? (unitPrice * Math.max(1, quantity)) : undefined;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <button onClick={() => navigate(-1)} className="text-sm text-primary hover:underline">
        &larr; Back
      </button>

      {/* Image */}
      {product.image_url && !imgHidden && (
        <div className="mt-3">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full max-h-80 rounded-2xl object-cover border border-base-300 bg-base-200 cursor-zoom-in"
            onClick={() => setShowImg(true)}
            onError={() => setImgHidden(true)}
          />
        </div>
      )}

      <h1 className="text-xl font-semibold mt-3 text-base-content">{product.name}</h1>
      {product.vendor?.name && (
        <div className="text-sm text-base-content/80">{product.vendor.name}</div>
      )}
      {Number.isFinite(minPrice) && (
        <div className="mt-1 text-sm font-semibold">
          ${(minPrice / 100).toFixed(2)}+
        </div>
      )}
      {product.description && (
        <p className="mt-3 text-base-content">{product.description}</p>
      )}

      {/* Subscribe box */}
      <div className="mt-6 space-y-3 rounded-xl border border-base-300 p-4">
        <div className="text-sm font-medium text-base-content">Choose an option</div>

        {/* Variant */}
        <select
          value={variantId}
          onChange={(e) => setVariantId(Number(e.target.value))}
          className="w-full rounded-lg border border-base-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — ${(v.price_cents / 100).toFixed(2)}
            </option>
          ))}
        </select>

        {/* Quantity (NEW) */}
        <div>
          <div className="text-xs text-base-content/80 mb-1">Quantity</div>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
              }}
              className="w-24 rounded-lg border border-base-300 p-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
            />
            <button
              type="button"
              className="btn"
              onClick={() => setQuantity(q => q + 1)}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          {typeof unitPrice === "number" && (
            <div className="mt-1 text-xs text-base-content/70">
              Unit: ${(unitPrice / 100).toFixed(2)} · Total:{" "}
              <span className="font-medium">
                ${(total! / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-base-content/80 mb-1">Start date</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-base-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
            />
          </div>
          <div>
            <div className="text-xs text-base-content/80 mb-1">Frequency</div>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full rounded-lg border border-base-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div>
          <div className="text-xs text-base-content/80 mb-1">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-base-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
            placeholder="Any preferences or pickup notes…"
          />
        </div>

        <button
          onClick={onSubscribe}
          disabled={submitting || !variantId || !startDate || quantity < 1}
          className="btn btn-primary w-full rounded-lg disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Subscribe"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-content shadow">
          {toast}
        </div>
      )}

      {/* Lightbox */}
      <Lightbox open={showImg} onClose={() => setShowImg(false)}>
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded"
            onClick={() => setShowImg(false)}
          />
        )}
      </Lightbox>
    </div>
  );
}