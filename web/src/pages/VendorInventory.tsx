import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import dayjs from "dayjs";
import { getVendorInventory, addInventoryEntry, getVendorLocations } from "../lib/api";
import { fulfillDelivery, markDeliveryReady, cancelDelivery } from "../lib/api";
import api from "../lib/api";

type Row = {
  product_id: number;
  product_name: string;
  product_variant_id: number;
  variant_name: string;
  manual_qty: number;
  reserved_qty: number;
  available_qty: number;
  entries: { id: number; type: "add" | "adjust"; qty: number; note?: string; created_at: string }[];
};

type Location = { id: number; label: string };

// flattened option for the picker
type VariantOption = {
  variantId: number;
  productId: number;
  label: string; // "Farm Fresh Eggs — 12 eggs"
};

export default function VendorInventory() {
  const { vendorId } = useParams();
  const [date, setDate] = useState<string>(dayjs().format("YYYY-MM-DD"));

  // locations
  const [locations, setLocations] = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<number | "all">("all");

  // inventory + orders
  const [rows, setRows] = useState<Row[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // add-inventory form state
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number | "">("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState<string>("1");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Pretty label for current location
  const selectedLocationLabel =
    locationId === "all"
      ? "All locations"
      : (() => {
          const found = locations.find((l) => l.id === locationId);
          return found?.label || `Location #${locationId}`;
        })();

  async function load() {
    if (!vendorId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await getVendorInventory(Number(vendorId), {
        date,
        ...(locationId !== "all" ? { location_id: Number(locationId) } : {}),
      });
      setRows(r.data.variants || []);
      setOrders(r.data.orders || []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, date, locationId]);

  // quick adjust buttons on each row
  async function quickAdd(variantId: number, productId: number, qty: number) {
    if (!vendorId) return;
    await addInventoryEntry(Number(vendorId), {
      product_id: productId,
      product_variant_id: variantId,
      for_date: date,
      qty,
      entry_type: qty >= 0 ? "add" : "adjust",
      note: qty >= 0 ? "Added" : "Adjusted",
      ...(locationId !== "all" ? { vendor_location_id: Number(locationId) } : {}),
    });
    await load();
  }

  // load vendor locations
  useEffect(() => {
    if (!vendorId) return;
    let cancel = false;
    setLocLoading(true);
    setLocErr(null);

    getVendorLocations(Number(vendorId))
      .then((r) => {
        if (cancel) return;
        const list: Location[] = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
        setLocations(list);
      })
      .catch((e: any) => !cancel && setLocErr(e?.response?.data?.message || e.message))
      .finally(() => !cancel && setLocLoading(false));

    return () => {
      cancel = true;
    };
  }, [vendorId]);

  // load vendor products + variants for the picker
  useEffect(() => {
    if (!vendorId) return;
    let cancel = false;

    // Public endpoint works: /api/vendors/{vendor}/products
    api
      .get(`/vendors/${vendorId}/products`, { params: { include_inactive: 1, per_page: 500 } })
      .then((res) => {
        if (cancel) return;
        // Accept either array or paginated { data: [...] }
        const products = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
        const opts: VariantOption[] = [];
        for (const p of products) {
          const vs = p.variants || [];
          for (const v of vs) {
            opts.push({
              variantId: v.id,
              productId: p.id,
              label: `${p.name ?? "Product"} — ${v.name ?? "Variant"}`,
            });
          }
        }
        // sort alphabetically by label
        opts.sort((a, b) => a.label.localeCompare(b.label));
        setVariantOptions(opts);
      })
      .catch(() => {
        setVariantOptions([]);
      });

    return () => {
      cancel = true;
    };
  }, [vendorId]);

  // When a variant is chosen, cache its product_id
  useEffect(() => {
    if (selectedVariant === "") {
      setSelectedProductId(null);
      return;
    }
    const found = variantOptions.find((o) => o.variantId === selectedVariant);
    setSelectedProductId(found ? found.productId : null);
  }, [selectedVariant, variantOptions]);

  // Add-inventory submit
  async function submitAdd() {
    if (!vendorId) return;
    const qtyInt = parseInt(addQty, 10);
    if (!selectedVariant || !selectedProductId || !Number.isFinite(qtyInt)) {
      setToast("Pick a variant and enter a valid quantity.");
      setTimeout(() => setToast(null), 1300);
      return;
    }
    setAdding(true);
    try {
      await addInventoryEntry(Number(vendorId), {
        product_id: selectedProductId,
        product_variant_id: Number(selectedVariant),
        for_date: date,
        qty: qtyInt,
        entry_type: qtyInt >= 0 ? "add" : "adjust",
        note: note || (qtyInt >= 0 ? "Added" : "Adjusted"),
        ...(locationId !== "all" ? { vendor_location_id: Number(locationId) } : {}),
      });
      // reset tiny form
      setSelectedVariant("");
      setSelectedProductId(null);
      setAddQty("1");
      setNote("");
      setToast("Saved");
      setTimeout(() => setToast(null), 900);
      await load();
    } catch (e: any) {
      setToast(e?.response?.data?.message || "Save failed");
      setTimeout(() => setToast(null), 1500);
    } finally {
      setAdding(false);
    }
  }

  const hasLocations = locations.length > 0;

  return (
    <div className="p-4 space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          className="input input-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {/* Location dropdown */}
        {locLoading ? (
          <span className="text-xs text-base-content/60">Loading locations…</span>
        ) : locErr ? (
          <span className="text-xs text-error">{locErr}</span>
        ) : hasLocations ? (
          <select
            value={locationId}
            onChange={(e) =>
              setLocationId(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="select select-sm bg-base-100"
            aria-label="Filter by location"
          >
            <option value="all">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label || `Location #${l.id}`}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Context line */}
      <div className="text-xs text-base-content/70">
        Showing inventory and orders for <b>{date}</b>
        {hasLocations && (
          <>
            {" "}
            — <b>{selectedLocationLabel}</b>
          </>
        )}
      </div>

      {/* Add inventory panel */}
      <div className="rounded-2xl border bg-base-100 p-4">
        <div className="text-sm font-semibold mb-3">Add / Adjust inventory</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-base-content/80 mb-1">Product / Variant</label>
            <select
              value={selectedVariant}
              onChange={(e) =>
                setSelectedVariant(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="select select-sm w-full bg-base-100"
            >
              <option value="">Select a variant…</option>
              {variantOptions.map((o) => (
                <option key={o.variantId} value={o.variantId}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-base-content/80 mb-1">Quantity</label>
            <input
              className="input input-sm w-full"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 10 or -2"
            />
            <div className="text-[11px] mt-1 text-base-content/60">
              Positive = add, negative = adjust (spoilage, etc.)
            </div>
          </div>

          <div>
            <label className="block text-xs text-base-content/80 mb-1">Note (optional)</label>
            <input
              className="input input-sm w-full"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Morning harvest"
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={submitAdd}
            disabled={adding}
            className="btn btn-sm"
          >
            {adding ? "Saving…" : "Save entry"}
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div className="text-error">{err}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Inventory by variant */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Inventory{" "}
              <span className="text-base-content/60">
                ({date}
                {hasLocations ? ` • ${selectedLocationLabel}` : ""})
              </span>
            </h3>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.product_variant_id} className="rounded-xl border p-3 bg-base-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{r.product_name}</div>
                      <div className="text-xs text-base-content/80">{r.variant_name}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div>
                        Added/Adj: <b>{r.manual_qty}</b>
                      </div>
                      <div>
                        Reserved: <b>{r.reserved_qty}</b>
                      </div>
                      <div>
                        Available: <b>{r.available_qty}</b>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn btn-xs"
                      onClick={() => quickAdd(r.product_variant_id, r.product_id, 1)}
                    >
                      +1
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={() => quickAdd(r.product_variant_id, r.product_id, 5)}
                    >
                      +5
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={() => quickAdd(r.product_variant_id, r.product_id, -1)}
                    >
                      -1
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={() => quickAdd(r.product_variant_id, r.product_id, -5)}
                    >
                      -5
                    </button>
                  </div>

                  {r.entries.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <div className="text-xs font-medium mb-1">Entries</div>
                      <ul className="space-y-1 text-xs">
                        {r.entries.map((e) => (
                          <li key={e.id} className="flex items-center justify-between">
                            <span>
                              {e.type} {e.qty} {e.note ? `— ${e.note}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <div className="text-sm text-base-content/80">
                  No inventory for this date{hasLocations ? " / location" : ""} yet.
                </div>
              )}
            </div>
          </div>

          {/* Right: Upcoming orders to fulfill (deliveries) */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Orders to fulfill{" "}
              <span className="text-base-content/60">
                ({date}
                {hasLocations ? ` • ${selectedLocationLabel}` : ""})
              </span>
            </h3>
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.delivery_id} className="rounded-xl border p-3 bg-base-100 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{o.product_name}</div>
                        <div className="text-xs text-base-content/80">
                          {o.variant_name}{o.scheduled_date ? ` • ${o.scheduled_date}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div>Qty: <b>{o.qty}</b></div>
                        <div className="text-xs mb-2">Status: {o.status}</div>

                        <div className="flex gap-2 justify-end">
                          {o.status === "scheduled" && (
                            <button
                              className="btn btn-xs"
                              onClick={async () => {
                                try {
                                  // optimistic update
                                  setOrders((cur) =>
                                    cur.map(x => x.delivery_id === o.delivery_id ? { ...x, status: "ready" } : x)
                                  );
                                  await markDeliveryReady(Number(vendorId), o.delivery_id);
                                  await load();
                                } catch (e: any) {
                                  await load();
                                }
                              }}
                              title="Mark this order as ready for pickup"
                            >
                              Mark ready
                            </button>
                          )}

                          {(o.status === "scheduled" || o.status === "ready") && (
                            <button
                              className="btn btn-xs"
                              onClick={async () => {
                                try {
                                  setOrders((cur) => cur.filter(x => x.delivery_id !== o.delivery_id));
                                  await cancelDelivery(Number(vendorId), o.delivery_id);
                                  await load();
                                } catch (e: any) {
                                  await load();
                                }
                              }}
                              title="Cancel this order"
                            >
                              Cancel
                            </button>
                          )}

                          {(o.status === "scheduled" || o.status === "ready") && (
                            <button
                              className="btn btn-xs"
                              onClick={async () => {
                                try {
                                  setOrders((cur) => cur.filter(x => x.delivery_id !== o.delivery_id));
                                  await fulfillDelivery(Number(vendorId), o.delivery_id);
                                  await load();
                                } catch (e: any) {
                                  await load();
                                }
                              }}
                              title="Mark this order as fulfilled (picked up/delivered)"
                            >
                              Mark fulfilled
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {orders.length === 0 && (
                  <div className="text-sm text-base-content/80">No orders scheduled for this date.</div>
                )}
              </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded bg-black/80 text-primary-content text-xs px-3 py-2">
          {toast}
        </div>
      )}
    </div>
  );
}