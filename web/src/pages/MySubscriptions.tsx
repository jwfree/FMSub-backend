import { useEffect, useState } from "react";
import api from "../lib/api";

type Subscription = {
  id: number;
  status: "active" | "paused" | "canceled" | "expired";
  start_date: string;
  frequency: string;
  notes?: string;
  product?: {
    id: number;
    name: string;
    vendor?: { id: number; name: string };
  };
  product_variant?: {
    id: number;
    name: string;
    price_cents: number;
  };
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function MySubscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Subscription[]>("/subscriptions/mine")
      .then((r) => !cancelled && setSubs(r.data))
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!subs.length) return <div className="p-4 text-base-content/80">No subscriptions yet.</div>;

  const activeSubs = subs.filter((s) => s.status === "active" || s.status === "paused");
  const inactiveSubs = subs.filter((s) => s.status === "canceled" || s.status === "expired");

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-8">
      {activeSubs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-base-content mb-3">Active</h2>
          <div className="space-y-3">
            {activeSubs.map((s) => (
              <SubscriptionCard key={s.id} sub={s} />
            ))}
          </div>
        </section>
      )}

      {inactiveSubs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-base-content mb-3">Inactive</h2>
          <div className="space-y-3">
            {inactiveSubs.map((s) => (
              <SubscriptionCard key={s.id} sub={s} inactive />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SubscriptionCard({ sub, inactive }: { sub: Subscription; inactive?: boolean }) {
  const [working, setWorking] = useState(false);

  async function action(endpoint: string) {
    setWorking(true);
    try {
      const r = await api.post(`/subscriptions/${sub.id}/${endpoint}`);
      console.log("Updated:", r.data);
      window.location.reload(); // quick reload; later replace with state update
    } catch (e) {
      console.error(e);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border bg-base-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{sub.product?.name}</h3>
          {sub.product?.vendor && (
            <div className="text-xs text-base-content/80">{sub.product.vendor.name}</div>
          )}
          {sub.product_variant && (
            <div className="text-xs text-base-content/80 mt-0.5">
              {sub.product_variant.name} — {centsToDollars(sub.product_variant.price_cents)}
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
  );
}