// src/pages/VendorNew.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function VendorNew() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const payload: any = { name: name.trim() };
      if (contactEmail.trim()) payload.contact_email = contactEmail.trim();
      if (contactPhone.trim()) payload.contact_phone = contactPhone.replace(/\D+/g, "");
      const res = await api.post("/vendors", payload);
      navigate(`/vendors/${res.data.id}`, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Could not create vendor.");
    } finally {
      setSaving(false);
    }
  }

  const prettyPhone = formatPhone(contactPhone);

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold mb-3">Become a vendor</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Vendor name</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Contact email (optional)</label>
          <input
            type="email"
            className="w-full rounded border px-3 py-2 text-sm"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Contact phone (optional)</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="555-123-4567"
          />
          {contactPhone && (
            <p className="text-[11px] text-gray-500 mt-1">
              Will be saved as: {prettyPhone || contactPhone.replace(/\D+/g, "")}
            </p>
          )}
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <button
          type="submit"
          className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
          disabled={saving || !name.trim()}
        >
          {saving ? "Creating…" : "Create vendor"}
        </button>
      </form>

      <p className="text-xs text-gray-500 mt-3">
        After creating, you can add a banner, photo, description, flyer text, products, and locations.
      </p>
    </div>
  );
}

function formatPhone(input: string) {
  const s = (input || "").replace(/\D+/g, "");
  if (s.length === 11 && s.startsWith("1")) return `(${s.slice(1,4)}) ${s.slice(4,7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
  return "";
}