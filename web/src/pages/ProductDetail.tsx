// web/src/pages/ProductDetail.tsx
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import Lightbox from "../components/Lightbox";
import { useParams, useNavigate, useLocation } from "react-router-dom";

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
  allow_waitlist?: boolean;
};

type WaitMineItem = {
  id: number;
  qty: number;
  position: number;
  total: number;
  variant?: { id: number; name: string; price_cents: number } | null;
  product?: { id: number; name: string } | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthed = !!localStorage.getItem("token");

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // subscribe/waitlist form
  const [variantId, setVariantId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number>(1);
  const [frequency, setFrequency] =
    useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // lightbox
  const [showImg, setShowImg] = useState(false);
  const [imgHidden, setImgHidden] = useState(false);

  // availability map (today)
  const [availableTodayByVariant, setAvailableTodayByVariant] = useState<Record<number, number>>({});
  const [availLoading, setAvailLoading] = useState(false);

  // my waitlist entries (for UX flip after join + showing position)
  const [myWaits, setMyWaits] = useState<WaitMineItem[] | null>(null);

  // Load product
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

  // Default variant
  useEffect(() => {
    if (product && product.variants?.length && variantId === "") {
      setVariantId(product.variants[0].id);
    }
  }, [product, variantId]);

  // Fetch today's availability
  useEffect(() => {
    if (!product?.vendor?.id) return;
    let cancelled = false;
    setAvailLoading(true);
    api
      .get(`/vendors/${product.vendor.id}/inventory`, {
        params: { date: todayISO() },
      })
      .then((r) => {
        if (cancelled) return;
        const rows: any[] = r.data?.variants ?? [];
        const map: Record<number, number> = {};
        for (const row of rows) {
          const vid = Number(row.product_variant_id);
          const avail = Number(row.available_qty ?? 0);
          if (Number.isFinite(vid)) map[vid] = avail;
        }
        setAvailableTodayByVariant(map);
      })
      .catch(() => setAvailableTodayByVariant({}))
      .finally(() => !cancelled && setAvailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [product?.vendor?.id]);

  // Fetch my waitlists (only if authed)
  async function refreshMyWaits() {
    if (!isAuthed) {
      setMyWaits(null);
      return;
    }
    try {
      const r = await api.get<WaitMineItem[]>("/waitlists/mine");
      setMyWaits(r.data || []);
    } catch {
      setMyWaits(null);
    } finally {
    }
  }

  useEffect(() => {
    refreshMyWaits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // Derive whether *selected* variant is already on my waitlist (and position)
  const myWaitForSelected = useMemo(() => {
    if (!myWaits || !product || typeof variantId !== "number") return null;
    return (
      myWaits.find(
        (w) => (w.product?.id ?? -1) === product.id && (w.variant?.id ?? -1) === variantId
      ) || null
    );
  }, [myWaits, product, variantId]);

  // --- Actions ---
  async function onSubscribe() {
    if (!variantId || !startDate || quantity < 1) return;
    setSubmitting(true);
    try {
      await api.post("/subscriptions", {
        product_variant_id: Number(variantId),
        start_date: startDate,
        frequency,
        quantity,
        notes: notes || undefined,
      });
      setToast("Subscription created!");
      navigate("/subscriptions");
    } catch (e: any) {
      if (e?.response?.status === 401) {
        window.location.href = `/account?next=/products/${id}`;
        return;
      }
      setToast(e?.response?.data?.message || "Failed to create subscription");
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(null), 2000);
    }
  }

async function onJoinWaitlist() {
  if (!variantId) return;
  if (!isAuthed) {
    // require login to personalize waitlist + show position later
    window.location.href = `/login?next=/products/${id}`;
    return;
  }
  setSubmitting(true);
  try {
    // Backend expects: product_variant_id, qty, note
    await api.post("/waitlist", {
      product_variant_id: Number(variantId),
      qty: Math.max(1, quantity),
      note: notes || undefined,
    });
    setToast("Added to waitlist!");

    // refresh my waits to get position/total and flip UI
    await refreshMyWaits();

    // 🔔 Notify other tabs/components (e.g. Browse) to update waitlist indicators
    window.dispatchEvent(new CustomEvent("waitlist:changed"));
  } catch (e: any) {
    setToast(e?.response?.data?.message || "Failed to join waitlist");
  } finally {
    setSubmitting(false);
    setTimeout(() => setToast(null), 2000);
  }
}
  // --- Derived state ---
  if (loading) return <div className="p-4 text-sm text-base-content/80">Loading…</div>;
  if (err || !product) return <div className="p-4 text-error">{err ?? "Not found"}</div>;

  const minPrice = Math.min(...(product.variants || []).map((v) => v.price_cents));
  const selected = product.variants.find((v) => v.id === variantId);
  const unitPrice = selected?.price_cents ?? (Number.isFinite(minPrice) ? minPrice : undefined);
  const total = typeof unitPrice === "number" ? unitPrice * Math.max(1, quantity) : undefined;

  const selectedAvailToday =
    typeof variantId === "number" ? availableTodayByVariant[variantId] : undefined;
  const outOfStockToday =
    typeof selectedAvailToday === "number" ? selectedAvailToday <= 0 : false;

  const canWaitlist = !!product.allow_waitlist && outOfStockToday;

  // Button labeling/state
  const alreadyOnWaitlist = !!myWaitForSelected;
  const waitlistBadge =
    alreadyOnWaitlist && myWaitForSelected?.position && myWaitForSelected?.total
      ? `On waitlist: ${myWaitForSelected.position} of ${myWaitForSelected.total}`
      : "On waitlist";

  let buttonText = "Subscribe";
  if (outOfStockToday && !canWaitlist) buttonText = "Out of stock";
  if (canWaitlist) buttonText = alreadyOnWaitlist ? waitlistBadge : "Join waitlist";

  const buttonDisabled =
    submitting ||
    !variantId ||
    !startDate ||
    quantity < 1 ||
    (outOfStockToday && !canWaitlist) ||
    (canWaitlist && alreadyOnWaitlist); // disable if already on waitlist

  const handleClick =
    outOfStockToday && canWaitlist ? onJoinWaitlist : onSubscribe;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <button
        onClick={() => {
          const from = (location.state as any)?.from;
          if (typeof from === "string" && from) navigate(from);
          else navigate(-1);
        }}
        className="text-sm text-primary hover:underline"
      >
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
        <div className="mt-1 text-sm font-semibold">${(minPrice / 100).toFixed(2)}+</div>
      )}
      {product.description && <p className="mt-3 text-base-content">{product.description}</p>}

      {/* Subscribe / Waitlist box */}
      <div className="mt-6 space-y-3 rounded-xl border border-base-300 p-4">
        <div className="text-sm font-medium text-base-content">Choose an option</div>

        {/* Variant selector */}
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

        {/* Availability + Waitlist notice */}
        {availLoading ? (
          <div className="text-xs text-base-content/70">Checking today’s availability…</div>
        ) : typeof selectedAvailToday === "number" ? (
          <div
            className={`text-xs ${
              outOfStockToday ? "text-error" : "text-base-content/70"
            }`}
          >
            {outOfStockToday
              ? canWaitlist
                ? "Currently out of stock — you can join the waitlist"
                : "Out of stock today"
              : `Available today: ${selectedAvailToday}`}
          </div>
        ) : null}

        {/* If already on waitlist for selected variant, surface the position here too */}
        {canWaitlist && alreadyOnWaitlist && (
          <div className="text-xs text-warning">
            {myWaitForSelected?.position && myWaitForSelected?.total
              ? `You’re on the waitlist for this option — position ${myWaitForSelected.position} of ${myWaitForSelected.total}.`
              : `You’re on the waitlist for this option.`}
          </div>
        )}

        {/* Quantity */}
        <div>
          <div className="text-xs text-base-content/80 mb-1">Quantity</div>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
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
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          {typeof unitPrice === "number" && (
            <div className="mt-1 text-xs text-base-content/70">
              Unit: ${(unitPrice / 100).toFixed(2)} · Total:{" "}
              <span className="font-medium">${((total ?? 0) / 100).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Start date + frequency */}
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

        {/* Notes */}
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

        {/* Main action */}
        <button
          onClick={handleClick}
          disabled={buttonDisabled}
          className={`btn w-full rounded-lg disabled:opacity-60 ${
            canWaitlist
              ? alreadyOnWaitlist
                ? "btn-ghost border border-base-300"
                : "btn-secondary"
              : outOfStockToday
              ? "btn-ghost border border-base-300"
              : "btn-primary"
          }`}
          title={alreadyOnWaitlist ? "You’re already on this waitlist" : undefined}
        >
          {submitting ? "Processing…" : buttonText}
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