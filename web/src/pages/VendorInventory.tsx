import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import api, {
  getVendorInventory,
  addInventoryEntry,
  addInventoryEntriesBulk,
} from "../lib/api";

// --- Minimal local types (so we don't rely on ../types) ---
type InventoryEntryRow = {
  id: number;
  type: "add" | "adjust";
  qty: number;
  note?: string | null;
  created_at: string;
};

type VariantRow = {
  product_id: number;
  product_name: string;
  product_variant_id: number;
  variant_name: string;
  price_cents: number;
  quantity_per_unit: number | null;
  unit_label: string | null;
  manual_qty: number;
  reserved_qty: number;
  available_qty: number;
  entries: InventoryEntryRow[];
};

type DeliveryRow = {
  delivery_id: number;
  scheduled_date: string;
  status: string;
  qty: number;
  subscription_id: number;
  customer_id: number;
  product_name: string;
  variant_name: string;
  product_variant_id: number;
};

type IntervalKind = "daily" | "every_n_days" | "weekly" | "monthly";

export default function VendorInventory() {
  // --- URL/context ---
  const path = window.location.pathname; // /vendors/:id/inventory
  const vendorId = Number((path.match(/\/vendors\/(\d+)\/inventory/) || [])[1] || 0);

  // --- filters ---
  const [date, setDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [locationId, setLocationId] = useState<number | "all">("all");

  // --- add / adjust (single-day) ---
  const [variantId, setVariantId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [note, setNote] = useState<string>("");

  // --- bulk schedule ---
  const [startDate, setStartDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [intervalKind, setIntervalKind] = useState<IntervalKind>("daily");
  const [nDays, setNDays] = useState<number>(2); // only for every_n_days
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);

  // --- data ---
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [orders, setOrders] = useState<DeliveryRow[]>([]);
  const [variants, setVariants] = useState<
    { id: number; name: string; product_id: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  // --- styles ---


  // ---------------- API fallbacks (no changes to api.ts required) ----------------
  async function patchInventoryEntryQty(vendorId: number, entryId: number, payload: any) {
    // Route exists in your api.php:
    // PATCH /vendors/{vendor}/inventory/entries/{id}
    await api.patch(`/vendors/${vendorId}/inventory/entries/${entryId}`, payload);
  }

  async function deliveryAction(
    vendorId: number,
    deliveryId: number,
    action: "ready" | "cancel" | "fulfilled"
  ) {
    // Try a few likely endpoints so we don't have to touch api.ts right now.
    const candidates = [
      // single endpoint that accepts {action}
      { method: "post", url: `/vendors/${vendorId}/deliveries/${deliveryId}/action`, body: { action } },
      // verb endpoints
      { method: "post", url: `/vendors/${vendorId}/deliveries/${deliveryId}/${action}`, body: {} },
      // inventory-controller scoped action
      { method: "post", url: `/vendors/${vendorId}/inventory/deliveries/${deliveryId}/${action}`, body: {} },
    ] as const;

    let lastErr: any = null;
    for (const c of candidates) {
      try {
        if (c.method === "post") {
          await api.post(c.url, c.body);
        }
        return;
      } catch (e: any) {
        lastErr = e;
        // try next candidate
      }
    }
    throw lastErr;
  }

  // ---------------- Data load ----------------
  async function load() {
    setLoading(true);
    try {
      const params: any = { date };
      if (locationId !== "all") params.location_id = locationId;
      const r = await getVendorInventory(vendorId, params);
      const data = r?.data || r; // tolerate either shape
      setRows((data?.variants as VariantRow[]) || []);
      setOrders((data?.orders as DeliveryRow[]) || []);
      const vset =
        (data?.variants as VariantRow[] | undefined)?.map((v) => ({
          id: v.product_variant_id,
          name: `${v.product_name} — ${v.variant_name}`,
          product_id: v.product_id,
        })) ?? [];
      setVariants(vset);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, locationId]);

  // ----- auto preview dates (client-side) -----
  const computedPreviewDates = useMemo(() => {
    const s = dayjs(startDate);
    const e = dayjs(endDate);
    if (!s.isValid() || !e.isValid() || e.isBefore(s)) return [];
    let cur = s;
    const out: string[] = [];
    const guard = 1000;
    let count = 0;
    while (cur.isSame(e) || cur.isBefore(e)) {
      out.push(cur.format("YYYY-MM-DD"));
      if (intervalKind === "daily") cur = cur.add(1, "day");
      else if (intervalKind === "weekly") cur = cur.add(1, "week");
      else if (intervalKind === "monthly") cur = cur.add(1, "month");
      else cur = cur.add(Math.max(2, Number(nDays || 2)), "day");
      if (++count > guard) break;
    }
    return out;
  }, [startDate, endDate, intervalKind, nDays]);

  // keep UI preview list in sync when open
  useEffect(() => {
    if (!previewOpen) return;
    const lines = computedPreviewDates.map((d) => `${d} — qty ${qty || 0}`);
    setPreviewLines(lines);
  }, [previewOpen, computedPreviewDates, qty]);

  // --- handlers ---
  function onSelectVariant(id: number) {
    setVariantId(id);
    const v = variants.find((p) => p.id === id);
    setProductId(v?.product_id ?? null);
  }

  async function handleSaveSingle() {
    if (!variantId || !productId) return;
    await addInventoryEntry(vendorId, {
      vendor_location_id: locationId === "all" ? undefined : Number(locationId),
      product_id: productId,
      product_variant_id: variantId,
      for_date: date,
      qty,
      entry_type: qty >= 0 ? "add" : "adjust",
      note: note || undefined,
    });
    setNote("");
    await load();
  }

  async function handleCreateBulk(dryRun = false) {
    if (!variantId || !productId) return;
    const payload: any = {
      vendor_location_id: locationId === "all" ? undefined : Number(locationId),
      product_id: productId,
      product_variant_id: variantId,
      start_date: startDate,
      end_date: endDate,
      qty,
      entry_type: qty >= 0 ? "add" : "adjust",
      note: note || undefined,
      pattern: { kind: intervalKind, n: intervalKind === "every_n_days" ? nDays : undefined },
      dry_run: dryRun,
    };

    if (dryRun) {
      setPreviewBusy(true);
      try {
        const r = await addInventoryEntriesBulk(vendorId, payload);
        const data = r?.data || r;
        const lines = (data?.dates as string[] | undefined)?.map((d) => `${d} — qty ${qty}`) ?? [];
        setPreviewLines(lines);
        setPreviewOpen(true);
      } finally {
        setPreviewBusy(false);
      }
      return;
    }

    await addInventoryEntriesBulk(vendorId, payload);
    await load();
    setPreviewOpen(false);
  }

  async function onMarkReady(deliveryId: number) {
    await deliveryAction(vendorId, deliveryId, "ready");
    await load();
  }
  async function onCancel(deliveryId: number) {
    await deliveryAction(vendorId, deliveryId, "cancel");
    await load();
  }
  async function onFulfilled(deliveryId: number) {
    await deliveryAction(vendorId, deliveryId, "fulfilled");
    await load();
  }

  // inline edit for entry qty
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState<number>(0);

  function startEdit(entry: InventoryEntryRow) {
    setEditingEntryId(entry.id);
    setEditingQty(entry.qty);
  }
  async function saveEdit(entry: InventoryEntryRow) {
    await patchInventoryEntryQty(vendorId, entry.id, { qty: editingQty });
    setEditingEntryId(null);
    await load();
  }
  function cancelEdit() {
    setEditingEntryId(null);
  }

  // helpers
  function variantLabel(v: { id: number; name: string }) {
    return v.name;
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      {/* Filters row */}
      <div className="flex gap-2 mb-3">
        <input
          type="date"
          className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
          value={locationId === "all" ? "all" : String(locationId)}
          onChange={(e) =>
            setLocationId(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">All locations</option>
          {/* TODO: populate with actual locations if you pass them in response */}
        </select>
      </div>

      {/* Entry form */}
      <div className="rounded-xl border border-base-300 bg-base-100 p-4 mb-4">
        <div className="font-medium mb-3">Add / Adjust inventory</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <select
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
            value={variantId ?? ""}
            onChange={(e) => onSelectVariant(Number(e.target.value))}
          >
            <option value="" disabled>
              Select a variant…
            </option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)}
              </option>
            ))}
          </select>

          <input
            type="number"
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />

          <input
            placeholder="Note (optional)"
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="col-span-1 md:col-span-3 flex gap-2">
            <input
              type="date"
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="btn btn-success" onClick={handleSaveSingle} disabled={!variantId}>
              Save entry
            </button>
            <div className="self-center text-xs text-base-content/60">
              Legacy single-day action
            </div>
          </div>
        </div>

        {/* Bulk */}
        <div className="mt-4 pt-4 border-t border-base-300">
          <div className="font-medium mb-2">Bulk schedule</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="date"
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="date"
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <select
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={intervalKind}
              onChange={(e) => setIntervalKind(e.target.value as IntervalKind)}
            >
              <option value="daily">Daily</option>
              <option value="every_n_days">Every N days…</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {intervalKind === "every_n_days" && (
              <input
                type="number"
                min={2}
                className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
                value={nDays}
                onChange={(e) => setNDays(Number(e.target.value || 2))}
              />
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              className="btn"
              onClick={() => {
                if (!previewOpen) {
                  // when opening via click, refresh once from local compute
                  const lines = computedPreviewDates.map((d) => `${d} — qty ${qty || 0}`);
                  setPreviewLines(lines);
                }
                setPreviewOpen((v) => !v);
              }}
            >
              {previewOpen ? "Hide preview" : "Dry run / Preview"}
            </button>

            <button
              className="btn btn-success"
              onClick={() => handleCreateBulk(false)}
              disabled={!variantId || previewBusy}
            >
              Create entries
            </button>
          </div>

          {previewOpen && (
            <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-2 text-xs">
              {previewBusy ? (
                <div>Building preview…</div>
              ) : previewLines.length ? (
                <ul className="space-y-1">
                  {previewLines.map((l, i) => (
                    <li key={i} className="rounded border border-base-200 px-2 py-1">
                      {l}
                    </li>
                  ))}
                </ul>
              ) : (
                <div>No dates in range.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inventory left */}
        <div className="rounded-xl border border-base-300 bg-base-100 p-3">
          <div className="font-medium mb-2">
            Inventory ({date} • {locationId === "all" ? "All locations" : `Location ${locationId}`})
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.product_variant_id} className="rounded-lg border border-base-300">
                <div className="p-3">
                  <div className="font-medium">{r.product_name}</div>
                  <div className="text-xs text-base-content/70">
                    {r.quantity_per_unit
                      ? `${r.quantity_per_unit} ${r.unit_label || ""}`.trim()
                      : r.unit_label || ""}
                  </div>
                </div>

                {r.entries.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-t border-base-200 px-3 py-2"
                  >
                    <div className="text-sm">
                      <div className="font-medium capitalize">{e.type}</div>
                      <div className="text-xs text-base-content/60">
                        {dayjs(e.created_at).format("YYYY-MM-DD HH:mm")}
                      </div>
                    </div>

                    {editingEntryId === e.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editingQty}
                          onChange={(ev) => setEditingQty(Number(ev.target.value))}
                          className="w-24 rounded-lg border border-base-300 bg-base-100 p-1 text-sm"
                        />
                        <button className="btn btn-primary btn-xs" onClick={() => saveEdit(e)}>
                          Save
                        </button>
                        <button className="btn btn-xs" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="text-sm">Qty: {e.qty}</div>
                        <button className="btn btn-xs" onClick={() => startEdit(e)}>
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-4 p-3 text-xs text-base-content/70">
                  <div>Added/Adj: {r.manual_qty}</div>
                  <div>Reserved: {r.reserved_qty}</div>
                  <div>Available: {r.available_qty}</div>
                </div>
              </div>
            ))}

            {!rows.length && !loading && (
              <div className="text-sm text-base-content/70">No inventory for this date / location.</div>
            )}
          </div>
        </div>

        {/* Orders right */}
        <div className="rounded-xl border border-base-300 bg-base-100 p-3">
          <div className="font-medium mb-2">
            Orders to fulfill ({date} • {locationId === "all" ? "All locations" : `Location ${locationId}`})
          </div>

          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.delivery_id} className="rounded-lg border border-base-300 p-3">
                <div className="font-medium">{o.product_name}</div>
                <div className="text-xs text-base-content/70">
                  {o.variant_name} • {o.scheduled_date}
                </div>
                <div className="mt-1 text-sm">Qty: {o.qty}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn btn-xs" onClick={() => onMarkReady(o.delivery_id)}>
                    Mark ready
                  </button>
                  <button className="btn btn-xs" onClick={() => onCancel(o.delivery_id)}>
                    Cancel
                  </button>
                  <button className="btn btn-xs" onClick={() => onFulfilled(o.delivery_id)}>
                    Mark fulfilled
                  </button>
                </div>
              </div>
            ))}

            {!orders.length && !loading && (
              <div className="text-sm text-base-content/70">No orders scheduled for this date.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}