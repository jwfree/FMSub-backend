import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import ProductCard from "../components/ProductCard";

type Vendor = {
  id: number;
  name: string;
   description?: string | null;           // <— add
   contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;   // ✅ use URL fields
  photo_url?: string | null;    // ✅ use URL fields
  active: boolean;
  can_edit?: boolean;
  products?: any[];
};

export default function VendorDetail() {
  const { id } = useParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // edit form state
  const [openEdit, setOpenEdit] = useState(false);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [description, setDescription] = useState("");

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
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  async function saveEdits() {
    if (!vendor) return;
    setSaving(true);
    try {
      const form = new FormData();
      if (name !== vendor.name) form.append("name", name);
      if (contactEmail !== (vendor.contact_email ?? "")) form.append("contact_email", contactEmail || "");
      if (contactPhone !== (vendor.contact_phone ?? "")) form.append("contact_phone", contactPhone || "");
      if ((description ?? "") !== (vendor.description ?? "")) form.append("description", description || ""); // <—
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

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  // ✅ use full URLs from API (no /storage building)
  const bannerUrl = vendor.banner_url || undefined;
  const photoUrl  = vendor.photo_url  || undefined;

  // ✅ build absolute API links for QR / flyer
  const API = (api.defaults as any).baseURL as string; // e.g. https://fmsub.fbwks.com/api
  const flyerHref = `${API}/vendors/${vendor.id}/flyer.pdf`;
  const qrHref    = `${API}/vendors/${vendor.id}/qr.png`;

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Banner */}
      {bannerUrl && (
        <img
          src={bannerUrl}
          alt="Vendor banner"
          className="w-full h-40 sm:h-56 object-cover rounded-2xl mb-3"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      )}
      {/* Description (display) */}
      {vendor.description && (
        <div className="mt-4 text-xl">{vendor.description}</div>
      )}

      {/* Header row */}
      <div className="flex items-start gap-3">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Vendor"
            className="w-16 h-16 rounded-xl object-cover border"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{vendor.name}</h1>
          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            {vendor.contact_email && <div>{vendor.contact_email}</div>}
            {vendor.contact_phone && <div>{formatPhone(vendor.contact_phone)}</div>}
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
            <input className="w-full rounded border p-2 text-sm" value={name} onChange={(e)=>setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Contact email</label>
              <input className="w-full rounded border p-2 text-sm" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Contact phone</label>
              <input className="w-full rounded border p-2 text-sm" value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Banner image</label>
              <input type="file" accept="image/*" onChange={(e)=>setBannerFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Vendor photo</label>
              <input type="file" accept="image/*" onChange={(e)=>setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveEdits}
              disabled={saving}
              className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <a href={flyerHref} target="_blank" rel="noreferrer" className="rounded border px-4 py-2 text-sm">
              Download flyer
            </a>
            <a href={qrHref} target="_blank" rel="noreferrer" className="rounded border px-4 py-2 text-sm">
              Open QR
            </a>
          </div>
        </div>
      )}

      {/* Products */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Products</h2>
      <div className="grid grid-cols-1 gap-3">
        {vendor.products?.map((p: any) => (
          <Link key={p.id} to={`/products/${p.id}`}>
            <ProductCard product={p} />
          </Link>
        ))}
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
  if (s.length === 11 && s.startsWith("1")) return `(${s.slice(1,4)}) ${s.slice(4,7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
  return digits ?? "";
}