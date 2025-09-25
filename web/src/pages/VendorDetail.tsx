// web/src/pages/VendorDetail.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import ProductCard from "../components/ProductCard";
import type { Product } from "../components/ProductCard";
import Lightbox from "../components/Lightbox";

type Vendor = {
  id: number;
  name: string;
  description?: string | null;
  flyer_text?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
  active: boolean;
  can_edit?: boolean;
  products?: Product[];
};

export default function VendorDetail() {
  const { id } = useParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // edit-panel state
  const [openEdit, setOpenEdit] = useState(false);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [flyerText, setFlyerText] = useState("");

  // lightboxes
  const [showPhoto, setShowPhoto] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/vendors/${id}`)
      .then((r) => {
        if (cancelled) return;
        setVendor(r.data);
        setName(r.data?.name ?? "");
        setContactEmail(r.data?.contact_email ?? "");
        setContactPhone(r.data?.contact_phone ?? "");
        setDescription(r.data?.description ?? "");
        setFlyerText(r.data?.flyer_text ?? "");
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveEdits() {
    if (!vendor) return;
    setSaving(true);
    try {
      const form = new FormData();
      if (name !== vendor.name) form.append("name", name);
      if (contactEmail !== (vendor.contact_email ?? ""))
        form.append("contact_email", contactEmail || "");
      if (contactPhone !== (vendor.contact_phone ?? ""))
        form.append("contact_phone", contactPhone || "");
      if ((description ?? "") !== (vendor.description ?? ""))
        form.append("description", description || "");
      if ((flyerText ?? "") !== (vendor.flyer_text ?? ""))
        form.append("flyer_text", flyerText || "");
      if (bannerFile) form.append("banner", bannerFile);
      if (photoFile) form.append("photo", photoFile);

      const res = await api.post(`/vendors/${vendor.id}/assets`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setVendor(res.data);
      setOpenEdit(false);
      setBannerFile(null);
      setPhotoFile(null);
      setToast("Saved!");
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      setToast(e?.response?.data?.message || "Save failed");
      setTimeout(() => setToast(null), 1600);
    } finally {
      setSaving(false);
    }
  }

  // Actions on products
  async function toggleActive(productId: number, desired: boolean) {
    if (!vendor) return;
    const next = {
      ...vendor,
      products: (vendor.products ?? []).map((p) =>
        p.id === productId ? { ...p, active: desired, is_active: desired } : p
      ),
    };
    setVendor(next as Vendor);
    try {
      await api
        .patch(`/vendors/${vendor.id}/products/${productId}`, { active: desired })
        .catch(async () => {
          await api.put(`/vendors/${vendor.id}/products/${productId}`, {
            active: desired,
          });
        });
    } catch {
      const r = await api.get(`/vendors/${vendor.id}`);
      setVendor(r.data);
      alert("Failed to change status");
    }
  }

  async function deleteProduct(productId: number) {
    if (!vendor) return;
    if (!confirm("Delete this product? This cannot be undone.")) return;

    setVendor({
      ...vendor,
      products: (vendor.products ?? []).filter((p) => p.id !== productId),
    } as Vendor);

    try {
      await api.delete(`/vendors/${vendor.id}/products/${productId}`);
    } catch {
      const r = await api.get(`/vendors/${vendor.id}`);
      setVendor(r.data);
      alert("Delete failed");
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  const bannerUrl = vendor.banner_url || undefined;
  const photoUrl = vendor.photo_url || undefined;

  const API = (api.defaults as any).baseURL as string;
  const flyerHref = `${API}/vendors/${vendor.id}/flyer.pdf`;
  const qrHref = `${API}/vendors/${vendor.id}/qr.png`;

  // sort: active first, then by name
  const productsSorted = [...(vendor.products ?? [])].sort((a, b) => {
    const aa = (a.active ?? a.is_active ?? true) ? 1 : 0;
    const bb = (b.active ?? b.is_active ?? true) ? 1 : 0;
    if (bb !== aa) return bb - aa;
    return (a.name || "").localeCompare(b.name || "");
  });

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Banner */}
      {bannerUrl && (
        <>
          <img
            src={bannerUrl}
            alt="Vendor banner"
            className="w-full h-40 sm:h-56 object-cover rounded-2xl mb-3 cursor-zoom-in"
            onClick={() => setShowBanner(true)}
            onError={(e) =>
              ((e.currentTarget as HTMLImageElement).style.display = "none")
            }
          />
          <Lightbox open={showBanner} onClose={() => setShowBanner(false)}>
            <img
              src={bannerUrl}
              alt="Vendor banner large"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded"
              onClick={() => setShowBanner(false)}
            />
          </Lightbox>
        </>
      )}

      {/* Header row */}
      <div className="flex items-start gap-3">
        {photoUrl && (
          <>
            <img
              src={photoUrl}
              alt="Vendor"
              className="w-16 h-16 rounded-xl object-cover border cursor-zoom-in"
              onClick={() => setShowPhoto(true)}
              onError={(e) =>
                ((e.currentTarget as HTMLImageElement).style.display = "none")
              }
            />
            <Lightbox open={showPhoto} onClose={() => setShowPhoto(false)}>
              <img
                src={photoUrl}
                alt="Vendor large"
                className="max-h-[90vh] max-w-[90vw] object-contain rounded"
                onClick={() => setShowPhoto(false)}
              />
            </Lightbox>
          </>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{vendor.name}</h1>
          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            {vendor.contact_email && <div>{vendor.contact_email}</div>}
            {vendor.contact_phone && <div>{formatPhone(vendor.contact_phone)}</div>}
          </div>

          {/* Centered description block */}
          {(vendor.flyer_text || vendor.description) && (
            <div className="mt-4 text-xl text-center">
              {vendor.flyer_text || vendor.description}
            </div>
          )}
        </div>

        {vendor.can_edit && (
          <button
            onClick={() => setOpenEdit((v) => !v)}
            className="rounded border px-3 py-1 text-xs"
          >
            {openEdit ? "Close" : "Edit"}
          </button>
        )}
      </div>

      {/* Edit panel */}
      {vendor.can_edit && openEdit && (
        <div className="mt-4 rounded-2xl border p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Vendor name</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Tell shoppers about your farm/stand and what you offer…"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Flyer text</label>
            <textarea
              value={flyerText}
              onChange={(e) => setFlyerText(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Text that appears on the flyer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Vendor email</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Vendor phone</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Banner image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Vendor photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveEdits}
              disabled={saving}
              className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            <a
              href={flyerHref}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-4 py-2 text-sm"
            >
              Download flyer
            </a>
            <a
              href={qrHref}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-4 py-2 text-sm"
            >
              Open QR
            </a>
            <Link
              to={`/vendors/${vendor.id}/products/new`}
              className="rounded border px-4 py-2 text-sm"
            >
              + Product
            </Link>
          </div>
        </div>
      )}

      {/* Products header + “+ Product” */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Products</h2>
        {vendor.can_edit && (
          <Link
            to={`/vendors/${vendor.id}/products/new`}
            className="rounded border px-4 py-2 text-sm"
          >
            + Product
          </Link>
        )}
      </div>

      {/* Products list */}
      <div className="grid grid-cols-1 gap-3">
        {productsSorted.map((p) => {
          const isActive = p.active ?? p.is_active ?? true;
          return (
            <ProductCard
              key={p.id}
              product={p}
              to={`/products/${p.id}`}
              actions={
                vendor.can_edit ? (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/vendors/${vendor.id}/products/${p.id}/edit`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                    >
                      ✎ <span className="hidden sm:inline">Edit</span>
                    </Link>

                    <button
                      onClick={() => toggleActive(p.id, !isActive)}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                    >
                      {isActive ? "Pause" : "Activate"}
                    </button>

                    <button
                      onClick={() => deleteProduct(p.id)}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                    >
                      ✕ <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>

      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded bg-black/80 text-white text-xs px-3 py-2">
          {toast}
        </div>
      )}
    </div>
  );
}

function formatPhone(digits?: string | null) {
  const s = (digits ?? "").replace(/\D+/g, "");
  if (s.length === 11 && s.startsWith("1"))
    return `(${s.slice(1, 4)}) ${s.slice(4, 7)}-${s.slice(7)}`;
  if (s.length === 10)
    return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
  return digits ?? "";
}