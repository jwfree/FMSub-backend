import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import ProductCard from "../components/ProductCard";

type Vendor = {
  id: number;
  name: string;
  description?: string | null;
  flyer_text?: string | null;   // ⬅️ add
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
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
  const [phoneInput, setPhoneInput] = useState(""); // shown exactly as typed
  const [description, setDescription] = useState("");
  const [flyerText, setFlyerText] = useState("");   // ⬅️ add

  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  const fetchVendor = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/vendors/${id}`);
      setVendor(r.data);
      setName(r.data?.name ?? "");
      setContactEmail(r.data?.contact_email ?? "");
      setPhoneInput(formatPhone(r.data?.contact_phone ?? "")); // preload pretty
      setDescription(r.data?.description ?? "");
      setFlyerText(r.data?.flyer_text ?? "");                  // ⬅️ add
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVendor();
  }, [fetchVendor]);

  async function saveEdits() {
    if (!vendor) return;
    setSaving(true);
    try {
      const form = new FormData();
      if (name !== vendor.name) form.append("name", name);
      if ((contactEmail ?? "") !== (vendor.contact_email ?? "")) {
        form.append("contact_email", contactEmail || "");
      }
      // normalize phone ONLY on submit
      const normalizedPhone = normalizePhone(phoneInput);
      if (normalizedPhone !== (vendor.contact_phone ?? "")) {
        form.append("contact_phone", normalizedPhone);
      }
      if ((description ?? "") !== (vendor.description ?? "")) {
        form.append("description", description || "");
      }
      if ((flyerText ?? "") !== (vendor.flyer_text ?? "")) {   
        form.append("flyer_text", flyerText || "");
      }
      if (bannerFile) form.append("banner", bannerFile);
      if (photoFile) form.append("photo", photoFile);

      await api.post(`/vendors/${vendor.id}/assets`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await fetchVendor(); // refresh products + URLs
      setOpenEdit(false);
      setBannerFile(null);
      setPhotoFile(null);
      flash("Saved!");
    } catch (e: any) {
      flash(e?.response?.data?.message || "Save failed", 1600);
    } finally {
      setSaving(false);
    }
  }

  function flash(msg: string, ms = 1200) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  const bannerUrl = vendor.banner_url || undefined;
  const photoUrl = vendor.photo_url || undefined;

  const API = (api.defaults as any).baseURL as string;
  const flyerHref = `${API}/vendors/${vendor.id}/flyer.pdf`;
  const qrHref = `${API}/vendors/${vendor.id}/qr.png`;
  const buttonClass = "rounded border px-4 py-2 text-sm";

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

      {/* Header row (left-aligned everywhere) */}
      <div className="flex items-start gap-3">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Vendor"
            className="w-16 h-16 rounded-xl object-cover border cursor-pointer"
            onClick={() => setShowPhoto(true)}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{vendor.name}</h1>
          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            {vendor.contact_email && <div>{vendor.contact_email}</div>}
            {vendor.contact_phone && <div>{formatPhone(vendor.contact_phone)}</div>}
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

      {/* Centered description display */}
      {vendor.description && (
        <div className="mt-4 text-xl text-center">{vendor.description}</div>
      )}

      {/* Edit panel */}
      {vendor.can_edit && openEdit && (
        <div className="mt-4 rounded-2xl border p-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Vendor name</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                className="w-full rounded border p-2 text-sm font-mono"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="(555) 123-4567 or +1 555-123-4567"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Saved as digits only; formatting shown automatically.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Description (site)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Tell shoppers about your farm/stand and what you offer…"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Flyer text (used on printable flyer)
            </label>
            <textarea
              value={flyerText}
              onChange={(e) => setFlyerText(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Short, punchy text for your flyer…"
            />
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
            

            <a href={flyerHref} target="_blank" rel="noreferrer" className={buttonClass}>
              Download flyer
            </a>
            <a href={qrHref} target="_blank" rel="noreferrer" className={buttonClass}>
              Open QR
            </a>
            {vendor.can_edit && (
              <Link to={`/vendors/${vendor.id}/products/new`} className={buttonClass}>
                Add product
              </Link>
            )}           
          </div>
        </div>
      )}

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

      {showPhoto && photoUrl && (
        <Lightbox imageUrl={photoUrl} onClose={() => setShowPhoto(false)} />
      )}
    </div>
  );
}

/** ===== Helpers ===== */

function formatPhone(input: string) {
  const s = (input ?? "").replace(/\D+/g, "");
  if (s.length === 11 && s.startsWith("1")) return `(${s.slice(1, 4)}) ${s.slice(4, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
  return input ?? "";
}

function normalizePhone(input: string) {
  const s = (input ?? "").trim();
  if (s.startsWith("+")) return "+" + s.slice(1).replace(/\D+/g, "");
  return s.replace(/\D+/g, "");
}

function Lightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img
        src={imageUrl}
        alt="Vendor"
        className="max-w-[90vw] max-h-[85vh] rounded-xl shadow"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}