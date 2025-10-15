// web/src/pages/VendorInventory.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import api, {
  getVendorInventory,
  addInventoryEntry,
  addInventoryEntriesBulk,
} from "../lib/api";

/* =========================
   Types
   ========================= */
type InventoryEntryRow = {
  id: number;
  type: "add" | "adjust";
  qty: number;
  note?: string | null;
  created_at: string;
  shelf_life_days: number | null; // NEW
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
  subscription_id: number | null;
  customer_id: number | null;
  product_name: string;
  variant_name: string;
  product_variant_id: number;
};

type WaitlistRow = {
  id: number;
  vendor_id: number;
  product_id: number;
  product_variant_id: number;
  qty: number;
  note?: string | null;
  created_at: string;
  product?: { id: number; name: string };
  variant?: { id: number; name: string };
  customer?: { id: number; name?: string | null; email?: string | null };
};

type IntervalKind = "daily" | "every_n_days" | "weekly" | "monthly";

/* =========================
   Component
   ========================= */
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
  const [shelfLifeSingle, setShelfLifeSingle] = useState<string>(""); // "" => null

  // --- bulk schedule ---
  const [startDate, setStartDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [intervalKind, setIntervalKind] = useState<IntervalKind>("daily");
  const [nDays, setNDays] = useState<number>(2); // only for every_n_days
  const [shelfLifeBulk, setShelfLifeBulk] = useState<string>(""); // "" => null
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);

  // --- data ---
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [orders, setOrders] = useState<DeliveryRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]); // vendor-wide
  const [variants, setVariants] = useState<
    { id: number; name: string; product_id: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  // --- light feedback ---
  const [toast, setToast] = useState<string | null>(null);

  // ---------------- API fallbacks ----------------
  async function patchInventoryEntry(
    vendorId: number,
    entryId: number,
    payload: Partial<{ qty: number; entry_type: "add" | "adjust"; note: string; shelf_life_days: number | null }>
  ) {
    await api.patch(`/vendors/${vendorId}/inventory/entries/${entryId}`, payload);
  }

  async function deliveryAction(
    vendorId: number,
    deliveryId: number,
    action: "ready" | "cancel" | "fulfilled"
  ) {
    const candidates = [
      { method: "post", url: `/vendors/${vendorId}/deliveries/${deliveryId}/action`, body: { action } },
      { method: "post", url: `/vendors/${vendorId}/deliveries/${deliveryId}/${action}`, body: {} },
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
      }
    }
    throw lastErr;
  }

  // --- Waitlist helpers (vendor-wide) ---
  async function fetchWaitlist(vendorId: number) {
    const r = await api.get(`/vendors/${vendorId}/waitlist`);
    return r.data as WaitlistRow[];
  }
  async function removeFromWaitlist(vendorId: number, entryId: number) {
    await api.delete(`/vendors/${vendorId}/waitlist/${entryId}`);
  }
  async function convertWaitlistToOrder(
    vendorId: number,
    entryId: number,
    date: string,
    locationId?: number | null
  ) {
    await api.post(`/vendors/${vendorId}/waitlist/${entryId}/convert`, {
      date,
      location_id: locationId ?? null,
    });
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

      // waitlist (vendor-wide)
      const wl = await fetchWaitlist(vendorId);
      setWaitlist(wl);
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

    const normalizedLife =
      shelfLifeSingle.trim() === ""
        ? null
        : Math.max(0, Math.floor(Number(shelfLifeSingle)));

    await addInventoryEntry(vendorId, {
      vendor_location_id: locationId === "all" ? undefined : Number(locationId),
      product_id: productId,
      product_variant_id: variantId,
      for_date: date,
      qty,
      entry_type: qty >= 0 ? "add" : "adjust",
      note: note || undefined,
      shelf_life_days: normalizedLife, // NEW
    });
    setNote("");
    setShelfLifeSingle("");
    await load();
    setToast("Inventory updated");
    setTimeout(() => setToast(null), 1200);
  }

  async function handleCreateBulk(dryRun = false) {
    if (!variantId || !productId) return;

    const normalizedLife =
      shelfLifeBulk.trim() === ""
        ? null
        : Math.max(0, Math.floor(Number(shelfLifeBulk)));

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
      shelf_life_days: normalizedLife, // NEW
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
    setToast("Bulk entries created");
    setTimeout(() => setToast(null), 1200);
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

  // inline edit for entry qty + shelf life
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState<number>(0);
  const [editingShelfLife, setEditingShelfLife] = useState<string>(""); // empty => null

  function startEdit(entry: InventoryEntryRow) {
    setEditingEntryId(entry.id);
    setEditingQty(entry.qty);
    setEditingShelfLife(
      entry.shelf_life_days === null || entry.shelf_life_days === undefined
        ? ""
        : String(entry.shelf_life_days)
    );
  }
  async function saveEdit(entry: InventoryEntryRow) {
    const payload: any = { qty: editingQty };
    if (editingShelfLife === "") {
      payload.shelf_life_days = null;
    } else {
      const n = Number(editingShelfLife);
      payload.shelf_life_days = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    }
    await patchInventoryEntry(vendorId, entry.id, payload);
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
  function renderShelfLife(days: number | null | undefined) {
    if (days === null || days === undefined) return "Shelf life: never expires";
    if (days === 0) return "Shelf life: same day only";
    if (days === 1) return "Shelf life: 1 day";
    return `Shelf life: ${days} days`;
  }

  /* =========================
     Render
     ========================= */
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Edit product</h1>
        <Link className="text-sm underline" to={`/vendors/${vendorId}`}>
          Back to vendor
        </Link>
      </div>
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

          {/* Shelf life (single) */}
          <div className="col-span-1 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="number"
              min={0}
              placeholder="Shelf life (days) — empty = never"
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={shelfLifeSingle}
              onChange={(e) => setShelfLifeSingle(e.target.value)}
            />
          </div>

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

          {/* Shelf life (bulk) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
            <input
              type="number"
              min={0}
              placeholder="Shelf life (days) — empty = never"
              className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm"
              value={shelfLifeBulk}
              onChange={(e) => setShelfLifeBulk(e.target.value)}
            />
          </div>

          <div className="flex gap-2 mt-3">
            <button
              className="btn"
              onClick={() => {
                if (!previewOpen) {
                  const lines = computedPreviewDates.map((d) => `${d} — qty ${qty || 0}`);
                  setPreviewLines(lines);
                }
                setPreviewOpen((v) => !v);
              }}
            >
              {previewOpen ? "Hide preview" : "Dry run / Preview"}
            </button>

            <button
              className="btn"
              onClick={() => handleCreateBulk(true)}
              disabled={!variantId || previewBusy}
            >
              Build preview
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
                      <div className="text-[11px] text-base-content/60 mt-0.5">
                        {renderShelfLife(e.shelf_life_days)}
                      </div>
                    </div>

                    {editingEntryId === e.id ? (
                      <div className="flex items-center gap-2">
                        {/* Qty */}
                        <input
                          type="number"
                          value={editingQty}
                          onChange={(ev) => setEditingQty(Number(ev.target.value))}
                          className="w-24 rounded-lg border border-base-300 bg-base-100 p-1 text-sm"
                          aria-label="Quantity"
                        />
                        {/* Shelf life (days) */}
                        <input
                          type="number"
                          min={0}
                          value={editingShelfLife}
                          onChange={(ev) => setEditingShelfLife(ev.target.value)}
                          placeholder="Shelf life (days)"
                          className="w-36 rounded-lg border border-base-300 bg-base-100 p-1 text-sm"
                          aria-label="Shelf life in days (empty = never)"
                          title="Empty = never expires"
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

        {/* Right column: Orders + Waitlist */}
        <div className="space-y-4">
          {/* Orders */}
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

          {/* Waitlist */}
          <div className="rounded-xl border border-base-300 bg-base-100 p-3">
            <div className="font-medium mb-2">Waitlist</div>

            <div className="space-y-3">
              {waitlist.map((w) => (
                <div key={w.id} className="rounded-lg border border-base-300 p-3">
                  <div className="font-medium">
                    {w.product?.name || "Product"} — {w.variant?.name || "Variant"}
                  </div>
                  <div className="text-xs text-base-content/70">
                    Added {dayjs(w.created_at).format("YYYY-MM-DD HH:mm")}
                    {w.customer?.name ? ` • ${w.customer.name}` : ""}
                    {w.customer?.email ? ` • ${w.customer.email}` : ""}
                  </div>
                  <div className="mt-1 text-sm">Qty: {w.qty}</div>
                  {w.note && (
                    <div className="mt-1 text-xs text-base-content/70">Note: {w.note}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={async () => {
                        try {
                          await convertWaitlistToOrder(
                            vendorId,
                            w.id,
                            date,
                            locationId === "all" ? null : Number(locationId)
                          );
                          setToast("Converted to order");
                          await load();
                        } catch (e: any) {
                          setToast(e?.response?.data?.message || "Convert failed");
                        } finally {
                          setTimeout(() => setToast(null), 1500);
                        }
                      }}
                    >
                      Convert to order
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={async () => {
                        if (!confirm("Remove from waitlist?")) return;
                        try {
                          await removeFromWaitlist(vendorId, w.id);
                          setToast("Removed from waitlist");
                          await load();
                        } catch (e: any) {
                          setToast(e?.response?.data?.message || "Remove failed");
                        } finally {
                          setTimeout(() => setToast(null), 1500);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!waitlist.length && !loading && (
                <div className="text-sm text-base-content/70">No one on the waitlist.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-content shadow">
          {toast}
        </div>
      )}
    </div>
  );
}