import { useEffect, useState } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";

type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
};

export default function VendorManage() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  // naive: use the first vendor the current user belongs to
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/my/vendors')
      .then(r => {
        const v = r.data?.[0];
        if (!v) throw new Error("No vendor membership");
        if (!cancelled) setVendor(v);
      })
      .catch(e => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    setErr(null);
    try {
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);

      // name/contact fields live in the same endpoint as files:
      // POST /vendors/{id}/assets (multipart)
      await api.post(`/vendors/${vendor.id}/assets`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const refreshed = await api.get(`/vendors/${vendor.id}`);
      setVendor(refreshed.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  const apiBase = import.meta.env.VITE_API_URL?.replace(/\/+$/,'')!;
  const qrPng   = `${apiBase}/vendors/${vendor.id}/qr.png`;
  const flyer   = `${apiBase}/vendors/${vendor.id}/flyer.pdf`;

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Manage Vendor</h1>
        <button
          onClick={() => navigate(`/vendors/${vendor.id}`)}
          className="text-xs rounded border px-3 py-1 hover:bg-gray-50"
        >
          View public page
        </button>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border p-4 bg-white">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Vendor name</label>
            <input name="name" defaultValue={vendor.name} className="w-full rounded border p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Email</label>
            <input name="contact_email" defaultValue={vendor.contact_email ?? ""} className="w-full rounded border p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Phone</label>
            <input name="contact_phone" defaultValue={vendor.contact_phone ?? ""} className="w-full rounded border p-2 text-sm" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Banner image</label>
            <input type="file" name="banner" accept="image/*" className="w-full text-sm" />
            {vendor.banner_url && <img src={vendor.banner_url} alt="Banner" className="mt-2 h-24 w-full object-cover rounded" />}
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Photo</label>
            <input type="file" name="photo" accept="image/*" className="w-full text-sm" />
            {vendor.photo_url && <img src={vendor.photo_url} alt="Photo" className="mt-2 h-24 w-24 object-cover rounded-full border" />}
          </div>
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="rounded-xl border p-4 bg-white">
        <div className="text-sm font-medium mb-2">QR Code</div>
        <div className="flex items-center gap-4">
          <img src={qrPng} alt="QR" className="w-40 h-40" />
          <div className="text-xs break-all">
            <div className="mb-2">Right-click to save image.</div>
            <a className="underline" href={qrPng} target="_blank" rel="noreferrer">Open QR in new tab</a>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-white">
        <div className="text-sm font-medium mb-2">Printable Flyer</div>
        <a
          href={flyer}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          target="_blank" rel="noreferrer"
        >
          Download PDF
        </a>
      </div>
    </div>
  );
}