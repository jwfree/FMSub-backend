import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { ensureJpeg } from "../lib/convertHeic";

type Variant = {
  id: number;
  name?: string | null;
  sku?: string | null;
  price_cents: number;
  active?: boolean;
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
};

export default function VendorProductEdit() {
  const { vendorId, productId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // fields
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [active, setActive] = useState(true);

  // image replace
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imageWarn, setImageWarn] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // We can fetch public product by id
    api.get<Product>(`/products/${productId}`)
      .then((r) => {
        if (cancelled) return;
        const p = r.data;
        setProduct(p);
        setName(p.name ?? "");
        setDescription(p.description ?? "");
        setUnit(p.unit ?? "");
        setActive(p.active ?? true);
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    return () => {
      objectUrls.current.forEach(URL.revokeObjectURL);
      objectUrls.current = [];
    };
  }, []);

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

  async function save() {
    if (!product || !vendorId) return;
    setErr(null);
    setSaving(true);
    try {
      // update simple fields
      await api.patch(`/vendors/${vendorId}/products/${product.id}`, {
        name,
        description: description || null,
        unit,
        active,
      });

      // optionally replace image
      if (newImageFile) {
        const fd = new FormData();
        fd.append("image", newImageFile);
        await api.post(
          `/vendors/${vendorId}/products/${product.id}/image`,
          fd,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
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

  if (loading) return <div className="p-4">Loading…</div>;
  if (err && !product) return <div className="p-4 text-red-600">{err}</div>;
  if (!product) return <div className="p-4">Not found</div>;

  const currentImage = imagePreview || product.image_url || null;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Edit product</h1>
        <Link className="text-sm underline" to={`/vendors/${vendorId}`}>Back to vendor</Link>
      </div>

      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}

      <div className="rounded-2xl border p-4 space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Product name</label>
          <input className="w-full rounded border p-2 text-sm" value={name} onChange={e=>setName(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Description</label>
          <textarea className="w-full rounded border p-2 text-sm" rows={3} value={description} onChange={e=>setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Unit</label>
            <input className="w-full rounded border p-2 text-sm" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. dozen, lb, bag" />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" className="rounded" checked={active} onChange={e=>setActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        <hr />

        {/* Variants are not edited here (out of scope for now) */}
        <div className="text-xs text-gray-500">
          Variant pricing is edited elsewhere. This page updates product details and image.
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Replace image</label>
          <input type="file" accept="image/*,.heic,.heif" onChange={(e)=>onPickImage(e.target.files?.[0] ?? null)} />
          {currentImage && (
            <img src={currentImage} alt="Preview" className="mt-2 h-24 w-24 rounded object-cover border" />
          )}
          {imageWarn && <div className="text-red-600 text-xs mt-1">{imageWarn}</div>}
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link to={`/vendors/${vendorId}`} className="rounded border px-4 py-2 text-sm">Cancel</Link>
        </div>
      </div>
    </div>
  );
}