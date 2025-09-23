import { useEffect, useState } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";

type Me = { id:number; name:string; email:string|null; phone:string|null };

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get<Me>("/account")
      .then(r => {
        setMe(r.data);
        setName(r.data.name ?? "");
        setEmail(r.data.email ?? "");
        setPhone(r.data.phone ?? "");
      })
      .catch(() => nav("/login"));
  }, [nav]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api.patch("/account", {
        name: name || null,
        email: email || null,
        phone: phone || null,
      });
      setMsg("Saved!");
      setTimeout(() => setMsg(null), 1500);
    } catch (e:any) {
      setMsg(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!me) return <div className="p-4 text-sm text-gray-600">Loading…</div>;

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold mb-3">Account</h1>
      <form onSubmit={onSave} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Name</label>
          <input className="w-full rounded border px-3 py-2 text-sm"
                 value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Email</label>
          <input type="email" className="w-full rounded border px-3 py-2 text-sm"
                 value={email} onChange={e=>setEmail(e.target.value)} placeholder="(optional)"/>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Phone</label>
          <input className="w-full rounded border px-3 py-2 text-sm"
                 value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(optional)"/>
        </div>
        {msg && <div className="text-xs text-blue-700">{msg}</div>}
        <button className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
                disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-3">
        Add whichever you didn’t sign up with (email or phone). You can use either to log in later.
      </p>
    </div>
  );
}