import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

/* ========================= Types ========================= */

type Subscription = {
  id: number;
  status: "active" | "paused" | "canceled" | "expired";
  start_date: string;
  frequency: string;
  notes?: string;
  quantity?: number;
  product?: {
    id: number;
    name: string;
    vendor?: { id: number; name: string };
    image_url?: string | null; // optional if backend starts sending it later
  };
  product_variant?: {
    id: number;
    name: string;
    price_cents: number;
  };
};

type WaitItem = {
  id: number; // waitlist entry id
  qty: number;
  note?: string | null;
  created_at?: string;
  position: number; // 1-based
  total: number;
  variant?: {
    id: number;
    name: string;
    price_cents: number;
  } | null;
  product?: {
    id: number;
    name: string;
    image_url?: string | null;
    vendor?: { id: number; name: string } | null;
  } | null;
};

/* ========================= Utils ========================= */

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

// Ensure image URLs are absolute (use backend base when relative)
const API_BASE = (api.defaults as any).baseURL as string;
function absoluteImg(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;                    // already absolute
  const base = API_BASE.replace(/\/+$/, "");
  if (u.startsWith("/")) return `${base}${u}`;              // "/storage/.."
  return `${base}/${u}`;                                    // "storage/.."
}

/* ========================= Page ========================= */

export default function MySubscriptions() {
  const [tab, setTab] = useState<"subs" | "wait">("subs");

  // subscriptions
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // waitlists
  const [waits, setWaits] = useState<WaitItem[]>([]);
  const [waitLoading, setWaitLoading] = useState(true);
  const [waitErr, setWaitErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // fetch subscriptions
    setSubsLoading(true);
    setSubsErr(null);
    api
      .get<Subscription[]>("/subscriptions/mine")
      .then((r) => !cancelled && setSubs(r.data))
      .catch((e) => !cancelled && setSubsErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setSubsLoading(false));

    // fetch waitlists
    setWaitLoading(true);
    setWaitErr(null);
    api
      .get<WaitItem[]>("/waitlists/mine")
      .then((r) => !cancelled && setWaits(r.data))
      .catch((e) => !cancelled && setWaitErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setWaitLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSubs = useMemo(
    () => subs.filter((s) => s.status === "active" || s.status === "paused"),
    [subs]
  );
  const inactiveSubs = useMemo(
    () => subs.filter((s) => s.status === "canceled" || s.status === "expired"),
    [subs]
  );

  const loading = tab === "subs" ? subsLoading : waitLoading;
  const error = tab === "subs" ? subsErr : waitErr;

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          className={`px-3 py-1.5 rounded-lg border text-sm ${tab === "subs" ? "bg-base-200 border-base-300" : "border-transparent hover:bg-base-200"}`}
          onClick={() => setTab("subs")}
        >
          Subscriptions
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg border text-sm ${tab === "wait" ? "bg-base-200 border-base-300" : "border-transparent hover:bg-base-200"}`}
          onClick={() => setTab("wait")}
        >
          Waitlists
        </button>
      </div>

      {/* Content */}
      {loading && <div>Loading…</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && tab === "subs" && (
        <div className="space-y-8">
          {activeSubs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-base-content mb-3">Active</h2>
              <div className="grid grid-cols-1 gap-3">
                {activeSubs.map((s) => (
                  <SubscriptionCard key={s.id} sub={s} />
                ))}
              </div>
            </section>
          )}

          {inactiveSubs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-base-content mb-3">Inactive</h2>
              <div className="grid grid-cols-1 gap-3">
                {inactiveSubs.map((s) => (
                  <SubscriptionCard key={s.id} sub={s} inactive />
                ))}
              </div>
            </section>
          )}

          {!activeSubs.length && !inactiveSubs.length && (
            <div className="text-base-content/70">No subscriptions yet.</div>
          )}
        </div>
      )}

      {!loading && !error && tab === "wait" && (
        <div className="space-y-6">
          {waits.length === 0 ? (
            <div className="text-base-content/70">You’re not on any waitlists yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {waits.map((w) => (
                <WaitItemCard
                  key={w.id}
                  item={w}
                  onRemoved={() => setWaits((prev) => prev.filter((x) => x.id !== w.id))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================= Cards ========================= */

function SubscriptionCard({ sub, inactive }: { sub: Subscription; inactive?: boolean }) {
  const [working, setWorking] = useState(false);

  const qty = typeof sub.quantity === "number" && sub.quantity > 0 ? sub.quantity : 1;
  const eachCents = sub.product_variant?.price_cents ?? 0;
  const totalCents = qty * eachCents;

  async function action(endpoint: string) {
    setWorking(true);
    try {
      await api.post(`/subscriptions/${sub.id}/${endpoint}`);
      // simple refresh for now; you could optimistically update instead
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setWorking(false);
    }
  }

const img = absoluteImg(sub.product?.image_url || null);

  return (
    <div className="rounded-xl border bg-base-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Image (optional) */}
        {img ? (
          <Link to={`/products/${sub.product?.id}`} className="shrink-0">
            <img
              src={img}
              alt={sub.product?.name || "Product"}
              className="w-16 h-16 rounded-lg object-cover border"
            />
          </Link>
        ) : null}

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/products/${sub.product?.id}`} className="text-sm font-semibold hover:underline">
                {sub.product?.name}
              </Link>
              {sub.product?.vendor && (
                <div className="text-xs text-base-content/80">{sub.product.vendor.name}</div>
              )}
              {sub.product_variant && (
                <div className="text-xs text-base-content/80 mt-0.5">
                  {sub.product_variant.name} — {centsToDollars(eachCents)} • Qty: {qty}
                  {qty > 1 && (
                    <span className="ml-1 text-base-content/60">
                      ({centsToDollars(totalCents)} total)
                    </span>
                  )}
                </div>
              )}
              <div className="text-xs text-base-content/60 mt-1">
                Every {sub.frequency}, starting {sub.start_date}
              </div>
              {sub.notes && <div className="text-xs text-base-content/60 mt-1">{sub.notes}</div>}
            </div>

            {inactive ? (
              <span className="px-2 py-1 rounded-full text-xs bg-base-200 text-base-content/80">
                {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                {sub.status === "active" && (
                  <button
                    disabled={working}
                    onClick={() => action("pause")}
                    className="text-xs px-2 py-1 rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {sub.status === "paused" && (
                  <button
                    disabled={working}
                    onClick={() => action("resume")}
                    className="text-xs px-2 py-1 rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                <button
                  disabled={working}
                  onClick={() => action("cancel")}
                  className="text-xs px-2 py-1 rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WaitItemCard({ item, onRemoved }: { item: WaitItem; onRemoved: () => void }) {
  const [working, setWorking] = useState(false);

  const img = absoluteImg(item.product?.image_url || null);

  const price = item.variant?.price_cents ?? undefined;
  const posText =
    item.position > 0 && item.total > 0 ? `${item.position} of ${item.total}` : "";

  async function remove() {
    if (!confirm("Remove this item from the waitlist?")) return;
    setWorking(true);
    try {
      await api.delete(`/waitlists/${item.id}`);
      onRemoved();
    } catch (e) {
      console.error(e);
      alert("Failed to remove from waitlist.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border bg-base-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Image */}
        {img ? (
          <Link to={`/products/${item.product?.id}`} className="shrink-0">
            <img
              src={img}
              alt={item.product?.name || "Product"}
              className="w-16 h-16 rounded-lg object-cover border"
            />
          </Link>
        ) : null}

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/products/${item.product?.id}`} className="text-sm font-semibold hover:underline">
                {item.product?.name}
              </Link>
              {item.product?.vendor?.name && (
                <div className="text-xs text-base-content/80">{item.product.vendor.name}</div>
              )}
              <div className="text-xs text-base-content/80 mt-0.5">
                {item.variant?.name ?? "Variant"}{price !== undefined ? ` — ${centsToDollars(price)}` : ""} • Qty: {item.qty}
              </div>
              {posText && (
                <div className="text-xs text-base-content/60 mt-1">
                  Position: {posText}
                </div>
              )}
              {item.note && <div className="text-xs text-base-content/60 mt-1">{item.note}</div>}
            </div>

            <div>
              <button
                disabled={working}
                onClick={remove}
                className="text-xs px-2 py-1 rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}