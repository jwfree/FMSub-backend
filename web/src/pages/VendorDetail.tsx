// web/src/pages/VendorDetail.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { getMyFavoriteVendors, favoriteVendor, unfavoriteVendor } from "../lib/api";
import ProductCard from "../components/ProductCard";
import type { Product } from "../components/ProductCard";
import Lightbox from "../components/Lightbox";

type Location = {
  id: number;
  label: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

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
  is_favorite?: boolean;
  products?: Product[];
  locations?: Location[];
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

  // address fields (Primary location)
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("US");

  // lightboxes
  const [showPhoto, setShowPhoto] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const [authPrompt, setAuthPrompt] = useState(false);
  const nextUrl = `${window.location.pathname}${window.location.search}`; 

  function fetchVendor() {
    return api.get(`/vendors/${id}`, { params: { include_inactive: 1 } }).then(r => r.data as Vendor);
  }

  // Load vendor + my favorites so the heart is correct on first paint
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    Promise.all([
      fetchVendor(),
      getMyFavoriteVendors().catch(() => [] as number[]), // not logged in -> empty
    ])
      .then(([data, favIds]) => {
        if (cancelled) return;
        const isFav = favIds.includes(data.id);
        const v = { ...data, is_favorite: isFav };

        setVendor(v);
        setName(v.name ?? "");
        setContactEmail(v.contact_email ?? "");
        setContactPhone(v.contact_phone ?? "");
        setDescription(v.description ?? "");
        setFlyerText(v.flyer_text ?? "");

        const L = v.locations?.[0];
        setAddress1(L?.address_line1 ?? "");
        setAddress2(L?.address_line2 ?? "");
        setCity(L?.city ?? "");
        setRegion(L?.region ?? "");
        setPostal(L?.postal_code ?? "");
        setCountry((L?.country ?? "US").toUpperCase());
      })
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [id]);

  async function saveEdits() {
    if (!vendor) return;
    setSaving(true);
    try {
      const patchBody: any = {
        name,
        contact_email: contactEmail || "",
        contact_phone: contactPhone || "",
        description: description || "",
        flyer_text: flyerText || "",
        address_line1: address1 || null,
        address_line2: address2 || null,
        city: city || null,
        region: region || null,
        postal_code: postal || null,
        country: (country || "US").toUpperCase(),
      };
      const patched = await api.patch(`/vendors/${vendor.id}`, patchBody);

      let finalVendor = patched.data as Vendor;
      if (bannerFile || photoFile) {
        const form = new FormData();
        if (bannerFile) form.append("banner", bannerFile);
        if (photoFile) form.append("photo", photoFile);
        const res = await api.post(`/vendors/${vendor.id}/assets`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        finalVendor = res.data;
      }

      // keep is_favorite flag after save
      setVendor({ ...finalVendor, is_favorite: vendor.is_favorite });
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

  // --- Favorites (heart) ---
  async function toggleFavorite() {
    if (!vendor) return;

    // not logged in? show gentle prompt
    if (!localStorage.getItem("token")) {
      setAuthPrompt(true);
      return;
    }

    const desired = !(vendor.is_favorite ?? false);
    setVendor({ ...vendor, is_favorite: desired }); // optimistic

    try {
      if (desired) await favoriteVendor(vendor.id);
      else await unfavoriteVendor(vendor.id);
    } catch (e: any) {
      setVendor({ ...vendor, is_favorite: !desired }); // revert
      if (e?.response?.status === 401) {
        setAuthPrompt(true);
        return;
      }
      setToast(e?.response?.data?.message || "Could not update favorite");
      setTimeout(() => setToast(null), 1500);
    }
  }
  // Actions on products
  async function toggleActive(productId: number, desired: boolean) {
    if (!vendor) return;

    setVendor({
      ...vendor,
      products: (vendor.products ?? []).map((p) =>
        p.id === productId ? { ...p, active: desired, is_active: desired } : p
      ),
    } as Vendor);

    try {
      await api
        .patch(`/vendors/${vendor.id}/products/${productId}`, { active: desired })
        .catch(async () => {
          await api.put(`/vendors/${vendor.id}/products/${productId}`, { active: desired });
        });
    } catch {
      const v = await fetchVendor();
      setVendor(v);
      alert("Failed to change status");
    }
  }

  async function deleteProduct(productId: number) {
    if (!vendor) return;
    if (!confirm("Delete this product permanently? This cannot be undone.")) return;

    setVendor({
      ...vendor,
      products: (vendor.products ?? []).filter((p) => p.id !== productId),
    } as Vendor);

    try {
      await api.delete(`/vendors/${vendor.id}/products/${productId}`);
    } catch {
      const v = await fetchVendor();
      setVendor(v);
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

  const all = [...(vendor.products ?? [])];
  const activeProducts = all
    .filter((p) => (p.active ?? p.is_active ?? true))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const inactiveProducts = all
    .filter((p) => !(p.active ?? p.is_active ?? true))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

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
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
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
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
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
        {authPrompt && (
          <div className="mt-3 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/80 flex items-center justify-between">
            <div>
              Want to follow this vendor?{" "}
              <a
                className="underline text-primary"
                href={`/login?next=${encodeURIComponent(nextUrl)}`}
              >
                Log in
              </a>{" "}
              or{" "}
              <a
                className="underline text-primary"
                href={`/signup?next=${encodeURIComponent(nextUrl)}`}
              >
                create an account
              </a>
              .
            </div>
            <button
              className="ml-3 rounded border px-2 py-1 hover:bg-base-200"
              onClick={() => setAuthPrompt(false)}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{vendor.name}</h1>
              <div className="text-xs text-base-content/80 mt-1 space-y-0.5">
                {vendor.contact_email && <div>{vendor.contact_email}</div>}
                {vendor.contact_phone && <div>{formatPhone(vendor.contact_phone)}</div>}
              </div>
            </div>

            {/* Heart / Follow */}
            <button
              aria-label={(vendor.is_favorite ? "Unfollow " : "Follow ") + vendor.name}
              onClick={toggleFavorite}
              className="select-none rounded-full px-3 py-1 text-sm leading-none hover:bg-base-200"
              title={vendor.is_favorite ? "Unfollow" : "Follow"}
            >
              <span className={`text-lg align-middle ${vendor.is_favorite ? "text-[var(--primary)]" : "text-neutral-500"}`}>
                {vendor.is_favorite ? "♥" : "♡"}
              </span>
            </button>
          </div>

          {(vendor.flyer_text || vendor.description) && (
            <div className="mt-4 text-xl text-center">
              {vendor.flyer_text || vendor.description}
            </div>
          )}
        </div>

        {vendor.can_edit && (
          <button
            onClick={() => setOpenEdit((v) => !v)}
            className="rounded border border-base-300 bg-base-100 px-3 py-1 text-xs"
          >
            {openEdit ? "Close" : "Edit"}
          </button>
        )}
      </div>

      {/* Edit panel */}
      {vendor.can_edit && openEdit && (
        <div className="mt-4 rounded-2xl border p-4 space-y-3">
          {/* Vendor name */}
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Vendor name</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Tell shoppers about your farm/stand and what you offer…"
            />
          </div>

          {/* Flyer text */}
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Flyer text</label>
            <textarea
              value={flyerText}
              onChange={(e) => setFlyerText(e.target.value)}
              rows={3}
              className="w-full rounded border p-2 text-sm"
              placeholder="Text that appears on the flyer"
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Vendor email</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Vendor phone</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Primary Location (address) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Address line 1</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Address line 2</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                placeholder="Suite / Apt"
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">City</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">State/Region</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Postal code</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Country (2-letter)</label>
              <input
                className="w-full rounded border p-2 text-sm"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="US"
              />
            </div>
          </div>

          {/* Images */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Banner image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Vendor photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveEdits}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            <a
              href={flyerHref}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
            >
              Download flyer
            </a>
            <a
              href={qrHref}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
            >
              Open QR
            </a>
          </div>
        </div>
      )}
      {/* Products */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-base-content">Products</h2>
        {vendor.can_edit && (
          <Link to={`/vendors/${vendor.id}/products/new`} className="rounded border px-4 py-2 text-sm">
            + Product
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {activeProducts.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            to={`/products/${p.id}`}
            actions={
              vendor.can_edit ? (
                <div className="flex flex-wrap gap-2">
                  <Link to={`/vendors/${vendor.id}/products/${p.id}/edit`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                    ✎ <span className="hidden sm:inline">Edit</span>
                  </Link>
                  <button onClick={() => toggleActive(p.id, false)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                    Pause
                  </button>
                  <button onClick={() => deleteProduct(p.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                    ✕ <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              ) : undefined
            }
          />
        ))}
      </div>

      {vendor.can_edit && inactiveProducts.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-xs font-semibold text-base-content/80 uppercase tracking-wide">
            Inactive
          </h3>
          <div className="grid grid-cols-1 gap-3 opacity-90">
            {inactiveProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                to={`/products/${p.id}`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/vendors/${vendor.id}/products/${p.id}/edit`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                      ✎ <span className="hidden sm:inline">Edit</span>
                    </Link>
                    <button onClick={() => toggleActive(p.id, true)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                      Activate
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                      ✕ <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 rounded bg-black/80 text-primary-content text-xs px-3 py-2">
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