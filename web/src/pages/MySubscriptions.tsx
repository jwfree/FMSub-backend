import { useEffect, useState } from "react";
import api from "../lib/api";

type Subscription = {
  id: number;
  status: "active" | "paused" | "canceled";
  start_date: string;
  frequency: "weekly" | "biweekly" | "monthly";
  notes?: string | null;
  product?: { id: number; name: string };
  product_variant?: { id: number; name?: string | null; sku?: string | null; price_cents?: number | null };
  vendor?: { id: number; name: string };
};

function centsToDollars(c?: number | null) {
  if (c == null) return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function MySubscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    api.get<Subscription[]>("/subscriptions/mine")
      .then(r => setSubs(r.data ?? []))
      .catch(e => setErr(e?.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function action(id: number, op: "pause" | "resume" | "cancel") {
    setBusyId(id);
    try {
      await api.post(`/subscriptions/${id}/${op}`);
      load();
    } catch (e:any) {
      alert(e?.response?.data?.message || `Failed to ${op}`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;

  if (!subs.length) {
    return <div className="p-4 text-sm text-gray-600">No subscriptions yet.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      {subs.map(s => (
        <div key={s.id} className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {s.product?.name || "Product"}{s.vendor?.name ? ` — ${s.vendor.name}` : ""}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {s.product_variant?.name || s.product_variant?.sku || "Variant"} ·{" "}
                {centsToDollars(s.product_variant?.price_cents)}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {s.frequency} · starts {s.start_date}
              </div>
              <div className="text-xs mt-0.5">
                Status:{" "}
                <span className={
                  s.status === "active" ? "text-green-700"
                  : s.status === "paused" ? "text-amber-700"
                  : "text-gray-700"
                }>
                  {s.status}
                </span>
              </div>
              {s.notes ? <div className="text-xs text-gray-600 mt-1">Notes: {s.notes}</div> : null}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {s.status === "active" && (
                <button
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => action(s.id, "pause")}
                  disabled={busyId === s.id}
                >
                  {busyId === s.id ? "…" : "Pause"}
                </button>
              )}
              {s.status === "paused" && (
                <button
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => action(s.id, "resume")}
                  disabled={busyId === s.id}
                >
                  {busyId === s.id ? "…" : "Resume"}
                </button>
              )}
              {s.status !== "canceled" && (
                <button
                  className="rounded border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => action(s.id, "cancel")}
                  disabled={busyId === s.id}
                >
                  {busyId === s.id ? "…" : "Cancel"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}