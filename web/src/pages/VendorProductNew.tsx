import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../lib/api";

// Reuse a lightweight Vendor shape
type Vendor = { id: number; name: string; can_edit?: boolean };

export default function VendorProductNew() {
  const { id } = useParams(); // vendor id
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");

  const [sku, setSku] = useState("");
  const [variantName, setVariantName] = useState("");
  const [price, setPrice] = useState<string>(""); // dollars string
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/vendors/${id}?with=none`)
      .then((r) => {
        if (cancelled) return;
        setVendor(r.data);
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  const canEdit = vendor?.can_edit === true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;

    setCreating(true);
    setErr(null);

    try {
      const payload: any = {
        name,
        unit,
        description: description || null,
      };

      if (sku || variantName || price) {
        payload.variant = {
          sku: sku || null,
          name: variantName || null,
          price: price ? parseFloat(price) : null, // dollars; backend converts to cents
          currency: "USD",
        };
      }

      await api.post(`/vendors/${vendor.id}/products`, payload);
      
      setToast("Product created");
      setTimeout(() => setToast(null), 1200);

      // Go to product detail (if you have it) or back to vendor page
      navigate(`/vendors/${vendor.id}`, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!vendor) return <div className="p-4">Vendor not found.</div>;
  if (!canEdit) return <div className="p-4">You don’t have permission to add products for this vendor.</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">New product for {vendor.name}</h1>
        <Link to={`/vendors/${vendor.id}`} className="text-sm underline">Back to vendor</Link>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Name</label>
            <input
              required
              className="w-full rounded border p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Farm Fresh Eggs"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Unit</label>
            <input
              required
              className="w-full rounded border p-2 text-sm"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. dozen, lb, bag"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Description</label>
          <textarea
            rows={3}
            className="w-full rounded border p-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details about the product…"
          />
        </div>

        <div className="border-t pt-3">
          <div className="text-sm font-medium mb-2">First variant (optional)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">SKU</label>
              <input className="w-full rounded border p-2 text-sm" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="EGG-12" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Variant name</label>
              <input className="w-full rounded border p-2 text-sm" value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="12 eggs" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Price (USD)</label>
              <input
                inputMode="decimal"
                className="w-full rounded border p-2 text-sm"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="5.00"
              />
            </div>
          </div>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create product"}
          </button>
          <Link to={`/vendors/${vendor.id}`} className="rounded border px-4 py-2 text-sm">
            Cancel
          </Link>
        </div>
      </form>

      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded bg-black/80 text-white text-xs px-3 py-2">
          {toast}
        </div>
      )}
    </div>
  );
}