// web/src/pages/VendorProductEdit.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { ensureJpeg } from "../lib/convertHeic";
import FilePicker from "../components/FilePicker";


type Variant = {
  id: number;
  name?: string | null;
  sku?: string | null;
  price_cents: number;
  currency?: string | null;
  active?: boolean;
  quantity_per_unit?: number | null;
  unit_label?: string | null;
  sort_order?: number | null;
};

type Product = {
  id: number;
  vendor?: { id: number; name: string };
  name: string;
  description?: string | null;
  unit: string;
  active?: boolean;
  image_url?: string | null;
  variants: Variant[];
  allow_waitlist?: boolean;
};

function toDollars(cents?: number | null): string {
  if (typeof cents !== "number" || !isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function toCents(text: string): number | null {
  const normalized = (text ?? "").replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function VendorProductEdit() {
  const { vendorId, productId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // product fields
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [active, setActive] = useState(true);
  const [allowWaitlist, setAllowWaitlist] = useState(false);

  // For backward-compat first-variant payload during product PATCH
  const [firstVariantDraft, setFirstVariantDraft] = useState<{
    id: number | null;
    sku: string;
    name: string;
    price: string; // dollars
    currency: string;
    active: boolean;
  }>({ id: null, sku: "", name: "", price: "", currency: "USD", active: true });

  // image replace
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imageWarn, setImageWarn] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  // variants local state for editor
  const [variants, setVariants] = useState<Variant[]>([]);
  const [vErr, setVErr] = useState<string | null>(null);
  const [vWorking, setVWorking] = useState<number | null>(null); // variant id while saving

  // Load product
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    api
      .get<Product>(`/products/${productId}`)
      .then((r) => {
        if (cancelled) return;
        const p = r.data;
        setProduct(p);
        setName(p.name ?? "");
        setDescription(p.description ?? "");
        setUnit(p.unit ?? "");
        setActive(p.active ?? true);
        setAllowWaitlist(!!p.allow_waitlist);

        setVariants((p.variants || []).slice().sort(sortVariants));

        // seed first-variant draft from first variant (if any)
        const v = (p.variants && p.variants[0]) || null;
        setFirstVariantDraft({
          id: v ? v.id : null,
          sku: v?.sku ?? "",
          name: v?.name ?? (p.unit ?? ""),
          price: toDollars(v?.price_cents),
          currency: (v?.currency ?? "USD").toUpperCase(),
          active: v?.active ?? true,
        });
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // cleanup object URLs
  useEffect(() => {
    return () => {
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.current = [];
    };
  }, []);

  // image pick/convert (HEIC → JPEG)
  async function onPickImage(f?: File | null) {
    setImageWarn(null);
    setNewImageFile(null);
    setImagePreview(null);
    if (!f) return;
    const { file, previewUrl, warning } = await ensureJpeg(f, {
      quality: 0.9,
      maxWidth: 3000,
      maxHeight: 3000,
      maxSizeMB: 8,
    });
    objectUrls.current.push(previewUrl);
    setNewImageFile(file);
    setImagePreview(previewUrl);
    setImageWarn(warning || null);
  }

  // Save product (and optional first-variant compatibility + image)
  async function save() {
    if (!product || !vendorId) return;
    setErr(null);

    // Basic validation for product
    if (!name.trim()) {
      setErr("Product name is required.");
      return;
    }
    if (!unit.trim()) {
      setErr("Unit is required (e.g. dozen, lb, bag).");
      return;
    }

    // Validate first-variant fields only if provided (keeps old flow working)
    const fvCents =
      firstVariantDraft.price.trim() === "" ? null : toCents(firstVariantDraft.price);
    if (fvCents !== null && !isFinite(fvCents)) {
      setErr("First variant price must be valid (e.g. 5.00).");
      return;
    }

    setSaving(true);
    try {
      // 1) PATCH product as JSON (includes allow_waitlist)
      await api.patch(`/vendors/${vendorId}/products/${product.id}`, {
        name,
        description: description || null,
        unit,
        active,
        allow_waitlist: allowWaitlist,
        // keep your “first variant for product save” fields if backend expects them here
        variant: {
          id: firstVariantDraft.id ?? undefined,
          sku: firstVariantDraft.sku || "",
          name: firstVariantDraft.name || unit,
          price_cents: fvCents ?? undefined,
          currency: firstVariantDraft.currency || "USD",
          active: firstVariantDraft.active,
        },
      });

      // 2) If there’s a new image, upload it via multipart to the image endpoint
      if (newImageFile) {
        const img = new FormData();
        img.append("image", newImageFile);
        await api.post(`/vendors/${vendorId}/products/${product.id}/image`, img, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      navigate(`/vendors/${vendorId}`);
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        (e?.response?.data?.errors &&
          Object.values(e.response.data.errors).flat().join(" ")) ||
        "Save failed";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  // --- Variants editor helpers ------------------------------------------------

  function sortVariants(a: Variant, b: Variant) {
    const soA = a.sort_order ?? 0;
    const soB = b.sort_order ?? 0;
    if (soA !== soB) return soA - soB;
    return a.id - b.id;
  }

  async function addVariant(draft: Omit<Variant, "id" | "price_cents"> & {
    price_dollars: string;
  }) {
    if (!product || !vendorId) return;
    setVErr(null);
    const price_cents = toCents(draft.price_dollars);
    if (price_cents === null) {
      setVErr("Price is required (e.g. 5.00).");
      return;
    }
    const payload = {
      sku: draft.sku ?? "",
      name: draft.name || product.unit,
      price_cents,
      currency: (draft.currency || "USD").toUpperCase(),
      active: draft.active ?? true,
      quantity_per_unit: draft.quantity_per_unit ?? null,
      unit_label: (draft.unit_label ?? "").trim() || null,
      sort_order: draft.sort_order ?? 0,
    };
    try {
      const r = await api.post(
        `/vendors/${vendorId}/products/${product.id}/variants`,
        payload
      );
      setVariants((v) => v.concat(r.data).sort(sortVariants));
    } catch (e: any) {
      setVErr(
        e?.response?.data?.message ||
          (e?.response?.data?.errors &&
            Object.values(e.response.data.errors).flat().join(" ")) ||
          "Add variant failed"
      );
    }
  }

  async function saveVariant(variantId: number, patch: Partial<Variant> & { price_dollars?: string }) {
    setVErr(null);
    setVWorking(variantId);
    const payload: any = { ...patch };

    if (typeof patch.price_dollars === "string") {
      const cents = toCents(patch.price_dollars);
      if (cents === null) {
        setVErr("Price is required (e.g. 5.00).");
        setVWorking(null);
        return;
      }
      payload.price_cents = cents;
      delete payload.price_dollars;
    }

    if (payload.currency) payload.currency = String(payload.currency).toUpperCase();

    try {
      const r = await api.patch(`/variants/${variantId}`, payload);
      setVariants((v) => v.map((x) => (x.id === variantId ? r.data : x)).sort(sortVariants));
    } catch (e: any) {
      setVErr(
        e?.response?.data?.message ||
          (e?.response?.data?.errors &&
            Object.values(e.response.data.errors).flat().join(" ")) ||
          "Update variant failed"
      );
    } finally {
      setVWorking(null);
    }
  }

  async function deleteVariant(variantId: number) {
    if (!confirm("Delete this variant?")) return;
    setVErr(null);
    try {
      await api.delete(`/variants/${variantId}`);
      setVariants((v) => v.filter((x) => x.id !== variantId));
    } catch (e: any) {
      setVErr(e?.response?.data?.message || "Delete failed");
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err && !product) return <div className="p-4 text-red-600">{err}</div>;
  if (!product) return <div className="p-4">Not found</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Edit product</h1>
        <Link className="text-sm underline" to={`/vendors/${vendorId}`}>
          Back to vendor
        </Link>
      </div>

      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}

      <div className="rounded-2xl border p-4 space-y-4 bg-base-100">
        {/* Product fields */}
        <div>
          <label className="block text-xs text-base-content/80 mb-1">Product name</label>
          <input
            className="w-full rounded border p-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-base-content/80 mb-1">Description</label>
          <textarea
            className="w-full rounded border p-2 text-sm"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Unit</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. dozen, lb, bag"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-base-content">
              <input
                type="checkbox"
                className="rounded"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-base-content">
              <input
                type="checkbox"
                className="rounded"
                checked={allowWaitlist}
                onChange={(e) => setAllowWaitlist(e.target.checked)}
              />
              Allow waitlist when out of stock
            </label>
          </div>
        </div>

        <hr />

        {/* Variants Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Variants</div>
            {vErr && <div className="text-xs text-red-600">{vErr}</div>}
          </div>

          <VariantsTable
            variants={variants}
            onSave={saveVariant}
            onDelete={deleteVariant}
            workingId={vWorking}
          />

          <AddVariantRow onAdd={addVariant} unitDefault={unit} />
        </div>

        <hr />

        {/* First-variant (compatibility with your existing PATCH contract) */}
        <div className="font-medium text-sm">First variant (for product save)</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-base-content/80 mb-1">SKU</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={firstVariantDraft.sku}
              onChange={(e) =>
                setFirstVariantDraft((d) => ({ ...d, sku: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Name</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={firstVariantDraft.name}
              onChange={(e) =>
                setFirstVariantDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder="e.g. 12 eggs"
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Price (USD)</label>
            <input
              className="w-full rounded border p-2 text-sm"
              inputMode="decimal"
              value={firstVariantDraft.price}
              onChange={(e) =>
                setFirstVariantDraft((d) => ({ ...d, price: e.target.value }))
              }
              placeholder="e.g. 5.00"
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Active</label>
            <div className="h-10 flex items-center">
              <input
                type="checkbox"
                className="rounded"
                checked={firstVariantDraft.active}
                onChange={(e) =>
                  setFirstVariantDraft((d) => ({ ...d, active: e.target.checked }))
                }
              />
            </div>
          </div>
        </div>

        <hr />

        {/* Image replace */}
        <div>
          <FilePicker
            label="Replace image"
            accept="image/*,.heic,.heif"
            onPick={onPickImage}
            // show the new preview if picked, otherwise the existing product image
            previewUrl={imagePreview ?? product?.image_url ?? null}
            // show the chosen file name (only after picking a new one)
            fileName={newImageFile?.name ?? null}
          />
          {imageWarn && <div className="text-red-600 text-xs mt-1">{imageWarn}</div>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link to={`/vendors/${vendorId}`} className="rounded border px-4 py-2 text-sm">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Variants Table + Add Row
   ========================= */

function VariantsTable({
  variants,
  onSave,
  onDelete,
  workingId,
}: {
  variants: Variant[];
  onSave: (id: number, patch: Partial<Variant> & { price_dollars?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  workingId: number | null;
}) {
  if (!variants.length) {
    return (
      <div className="text-sm text-base-content/70">
        No variants yet. Add one below.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-base-200">
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Qty/Unit</th>
            <th className="p-2 text-left">Unit label</th>
            <th className="p-2 text-left">Price</th>
            <th className="p-2 text-left">SKU</th>
            <th className="p-2 text-left">Currency</th>
            <th className="p-2 text-left">Sort</th>
            <th className="p-2 text-left">Active</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              onSave={onSave}
              onDelete={onDelete}
              working={workingId === v.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantRow({
  variant,
  onSave,
  onDelete,
  working,
}: {
  variant: Variant;
  onSave: (id: number, patch: Partial<Variant> & { price_dollars?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  working: boolean;
}) {
  const [draft, setDraft] = useState({
    name: variant.name ?? "",
    quantity_per_unit:
      typeof variant.quantity_per_unit === "number" ? variant.quantity_per_unit : ("" as number | ""),
    unit_label: variant.unit_label ?? "",
    price_dollars: toDollars(variant.price_cents),
    sku: variant.sku ?? "",
    currency: (variant.currency || "USD").toUpperCase(),
    sort_order: typeof variant.sort_order === "number" ? variant.sort_order : 0,
    active: !!variant.active,
  });

  return (
    <tr className="border-t">
      <td className="p-2">
        <input
          className="input input-xs w-full"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. 12 eggs"
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          className="input input-xs w-24"
          value={draft.quantity_per_unit}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              quantity_per_unit: e.target.value === "" ? "" : Number(e.target.value),
            }))
          }
          placeholder="e.g. 12"
        />
      </td>
      <td className="p-2">
        <input
          className="input input-xs w-28"
          value={draft.unit_label}
          onChange={(e) => setDraft((d) => ({ ...d, unit_label: e.target.value }))}
          placeholder="eggs"
        />
      </td>
      <td className="p-2">
        <input
          className="input input-xs w-24"
          inputMode="decimal"
          value={draft.price_dollars}
          onChange={(e) => setDraft((d) => ({ ...d, price_dollars: e.target.value }))}
          placeholder="5.00"
        />
      </td>
      <td className="p-2">
        <input
          className="input input-xs w-28"
          value={draft.sku}
          onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
        />
      </td>
      <td className="p-2">
        <input
          className="input input-xs w-20"
          value={draft.currency}
          onChange={(e) =>
            setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))
          }
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          className="input input-xs w-16"
          value={draft.sort_order}
          onChange={(e) =>
            setDraft((d) => ({ ...d, sort_order: Number(e.target.value || 0) }))
          }
        />
      </td>
      <td className="p-2">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
        />
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <button
          className="btn btn-xs mr-2"
          disabled={working}
          onClick={() =>
            onSave(variant.id, {
              name: draft.name,
              quantity_per_unit:
                draft.quantity_per_unit === "" ? null : Number(draft.quantity_per_unit),
              unit_label: (draft.unit_label || "").trim() || null,
              price_dollars: draft.price_dollars,
              sku: draft.sku,
              currency: draft.currency,
              sort_order: draft.sort_order,
              active: draft.active,
            })
          }
        >
          {working ? "Saving…" : "Save"}
        </button>
        <button
          className="btn btn-xs btn-ghost"
          disabled={working}
          onClick={() => onDelete(variant.id)}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function AddVariantRow({
  onAdd,
  unitDefault,
}: {
  onAdd: (draft: Omit<Variant, "id" | "price_cents"> & { price_dollars: string }) => Promise<void>;
  unitDefault: string;
}) {
  const [draft, setDraft] = useState({
    name: unitDefault || "",
    quantity_per_unit: "" as number | "",
    unit_label: "",
    price_dollars: "",
    sku: "",
    currency: "USD",
    sort_order: 0,
    active: true,
  });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await onAdd({
        name: draft.name,
        quantity_per_unit: draft.quantity_per_unit === "" ? null : Number(draft.quantity_per_unit),
        unit_label: (draft.unit_label || "").trim() || null,
        price_dollars: draft.price_dollars,
        sku: draft.sku,
        currency: draft.currency,
        sort_order: draft.sort_order,
        active: draft.active,
      });
      setDraft({
        name: unitDefault || "",
        quantity_per_unit: "",
        unit_label: "",
        price_dollars: "",
        sku: "",
        currency: "USD",
        sort_order: 0,
        active: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border p-3">
      <div className="text-xs font-semibold mb-2">Add a variant</div>
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        <input
          className="input input-xs"
          placeholder="Name (e.g. 12 eggs)"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <input
          className="input input-xs"
          type="number"
          placeholder="Qty (e.g. 12)"
          value={draft.quantity_per_unit}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              quantity_per_unit: e.target.value === "" ? "" : Number(e.target.value),
            }))
          }
        />
        <input
          className="input input-xs"
          placeholder="Unit label (eggs)"
          value={draft.unit_label}
          onChange={(e) => setDraft((d) => ({ ...d, unit_label: e.target.value }))}
        />
        <input
          className="input input-xs"
          inputMode="decimal"
          placeholder="Price (5.00)"
          value={draft.price_dollars}
          onChange={(e) => setDraft((d) => ({ ...d, price_dollars: e.target.value }))}
        />
        <input
          className="input input-xs"
          placeholder="SKU"
          value={draft.sku}
          onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
        />
        <input
          className="input input-xs"
          placeholder="USD"
          value={draft.currency}
          onChange={(e) =>
            setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))
          }
        />
        <input
          className="input input-xs"
          type="number"
          placeholder="Sort"
          value={draft.sort_order}
          onChange={(e) =>
            setDraft((d) => ({ ...d, sort_order: Number(e.target.value || 0) }))
          }
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
          />
          Active
        </label>
        <button className="btn btn-xs btn-primary" disabled={busy} onClick={add}>
          {busy ? "Adding…" : "Add variant"}
        </button>
      </div>
    </div>
  );
}