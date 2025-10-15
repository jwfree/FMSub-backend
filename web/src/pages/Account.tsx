// web/src/pages/Account.tsx
import { useEffect, useState } from "react";
import api, {
  listMyAddresses,
  createMyAddress,
  updateMyAddress,
  deleteMyAddress,
  type UserAddress,
} from "../lib/api";
import { useNavigate } from "react-router-dom";
import { changeMyPassword } from "../lib/api";


type Me = { id:number; name:string; email:string|null; phone:string|null };

function emptyAddress(): Partial<UserAddress> {
  return {
    label: "",
    recipient_name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "US",
    is_default: false,
    instructions: "",
  };
}

export default function Account() {
  // profile
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();

  // addresses
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [addrEditingId, setAddrEditingId] = useState<number | null>(null);
  const [addrDraft, setAddrDraft] = useState<Partial<UserAddress>>(emptyAddress());
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrMsg, setAddrMsg] = useState<string | null>(null);
  const [addrOpen, setAddrOpen] = useState(false); // <-- NEW: controls editor visibility

  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    api.get<Me>("/account")
      .then(async (r) => {
        setMe(r.data);
        setName(r.data.name ?? "");
        setEmail(r.data.email ?? "");
        setPhone(r.data.phone ?? "");
        // load addresses after auth
        const a = await listMyAddresses();
        setAddresses(a.data || []);
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
  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await changeMyPassword({
        current_password: curPwd,
        new_password: newPwd,
        new_password_confirmation: confirmPwd,
      });
      setPwdMsg("Password changed successfully");
      // clear fields
      setCurPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: any) {
      const m = e?.response?.data?.message 
                || e?.response?.data?.errors?.new_password?.[0]
                || e?.response?.data?.errors?.current_password?.[0]
                || "Change failed";
      setPwdMsg(m);
    } finally {
      setPwdBusy(false);
      // clear message after a while
      setTimeout(() => setPwdMsg(null), 3000);
    }
  }
  // Address CRUD
  function beginAdd() {
    setAddrEditingId(null);
    setAddrDraft(emptyAddress());
    setAddrOpen(true); // open editor even if draft fields are blank
  }
  function beginEdit(a: UserAddress) {
    setAddrEditingId(a.id);
    setAddrDraft({ ...a });
    setAddrOpen(true);
  }
  function cancelEdit() {
    setAddrEditingId(null);
    setAddrDraft(emptyAddress());
    setAddrOpen(false);
  }

  async function saveAddress() {
    setAddrBusy(true);
    setAddrMsg(null);
    try {
      // required minimal fields
      if (!addrDraft.line1 || !addrDraft.city || !addrDraft.postal_code) {
        setAddrMsg("Please fill line1, city, and postal code.");
        return;
      }
      const payload = {
        label: (addrDraft.label ?? "").trim() || null,
        recipient_name: (addrDraft.recipient_name ?? "").trim() || null,
        phone: (addrDraft.phone ?? "").trim() || null,
        line1: (addrDraft.line1 ?? "").trim(),
        line2: (addrDraft.line2 ?? "").trim() || null,
        city: (addrDraft.city ?? "").trim(),
        state: (addrDraft.state ?? "").trim() || null,
        postal_code: (addrDraft.postal_code ?? "").trim(),
        country: (addrDraft.country ?? "US").toUpperCase(),
        instructions: (addrDraft.instructions ?? "").trim() || null,
        is_default: !!addrDraft.is_default,
      };

      if (addrEditingId) {
        const r = await updateMyAddress(addrEditingId, payload);
        setAddresses((list) =>
          list.map((x) => (x.id === addrEditingId ? r.data : x)).sort(sortAddresses)
        );
      } else {
        const r = await createMyAddress(payload);
        setAddresses((list) => [r.data, ...list].sort(sortAddresses));
      }
      setAddrMsg("Saved!");
      setTimeout(() => setAddrMsg(null), 1200);
      cancelEdit();
    } catch (e: any) {
      setAddrMsg(e?.response?.data?.message || "Address save failed");
    } finally {
      setAddrBusy(false);
    }
  }

  function sortAddresses(a: UserAddress, b: UserAddress) {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.id - b.id;
  }

  async function onDeleteAddress(id: number) {
    if (!confirm("Delete this address?")) return;
    setAddrBusy(true);
    try {
      await deleteMyAddress(id);
      setAddresses((list) => list.filter((x) => x.id !== id));
      if (addrEditingId === id) cancelEdit();
    } catch (e: any) {
      setAddrMsg(e?.response?.data?.message || "Delete failed");
    } finally {
      setAddrBusy(false);
    }
  }

  async function onMakeDefault(id: number) {
    setAddrBusy(true);
    setAddrMsg(null);
    try {
      // If you add a backend endpoint later, call it here.
      // await makeMyDefaultAddress(id);
      setAddresses((list) =>
        list.map((x) => ({ ...x, is_default: x.id === id })).sort(sortAddresses)
      );
      setAddrMsg("Default address set");
      setTimeout(() => setAddrMsg(null), 1200);
    } catch (e:any) {
      setAddrMsg(e?.response?.data?.message || "Failed to set default");
    } finally {
      setAddrBusy(false);
    }
  }

  if (!me) return <div className="p-4 text-sm text-base-content/80">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      {/* Profile */}
      <section>
        <h1 className="text-lg font-semibold mb-3">Account</h1>
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Name</label>
            <input className="w-full rounded border px-3 py-2 text-sm"
                  value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Email</label>
              <input type="email" className="w-full rounded border px-3 py-2 text-sm"
                    value={email} onChange={e=>setEmail(e.target.value)} placeholder="(optional)"/>
            </div>
            <div>
              <label className="block text-xs text-base-content/80 mb-1">Phone</label>
              <input className="w-full rounded border px-3 py-2 text-sm"
                    value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(optional)"/>
            </div>
          </div>
          {msg && <div className="text-xs text-blue-700">{msg}</div>}
          <button className="w-full btn btn-primary disabled:opacity-60" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
        <p className="text-xs text-base-content/60 mt-3">
          Add whichever you didn’t sign up with (email or phone). You can use either to log in later.
        </p>
      </section>
      
      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Change password</h2>
        <form onSubmit={onChangePassword} className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Current password</label>
            <input
              type="password"
              className="w-full rounded border px-3 py-2 text-sm"
              value={curPwd}
              onChange={e => setCurPwd(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">New password</label>
            <input
              type="password"
              className="w-full rounded border px-3 py-2 text-sm"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Confirm new password</label>
            <input
              type="password"
              className="w-full rounded border px-3 py-2 text-sm"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              required
            />
          </div>
          {pwdMsg && <div className="text-xs text-blue-700">{pwdMsg}</div>}
          <button
            type="submit"
            className="w-full btn btn-primary disabled:opacity-60"
            disabled={pwdBusy}
          >
            {pwdBusy ? "Changing…" : "Change password"}
          </button>
        </form>
      </section>

      {/* Addresses */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Addresses</h2>
          <button className="btn btn-sm" onClick={beginAdd}>Add address</button>
        </div>

        {/* Editor */}
        {(addrOpen || addrEditingId !== null) && (
          <div className="mt-3 rounded-xl border p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                className="input input-sm" placeholder="Label (Home, Work)"
                value={addrDraft.label ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, label:e.target.value}))}
              />
              <input
                className="input input-sm" placeholder="Recipient name"
                value={addrDraft.recipient_name ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, recipient_name:e.target.value}))}
              />
              <input
                className="input input-sm" placeholder="Phone"
                value={addrDraft.phone ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, phone:e.target.value}))}
              />
            </div>

            <input
              className="input input-sm w-full" placeholder="Address line 1"
              value={addrDraft.line1 ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, line1:e.target.value}))}
            />
            <input
              className="input input-sm w-full" placeholder="Address line 2 (optional)"
              value={addrDraft.line2 ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, line2:e.target.value}))}
            />

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                className="input input-sm" placeholder="City"
                value={addrDraft.city ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, city:e.target.value}))}
              />
              <input
                className="input input-sm" placeholder="State/Region"
                value={addrDraft.state ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, state:e.target.value}))}
              />
              <input
                className="input input-sm" placeholder="Postal code"
                value={addrDraft.postal_code ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, postal_code:e.target.value}))}
              />
              <input
                className="input input-sm" placeholder="Country (US)"
                value={addrDraft.country ?? "US"} onChange={(e)=>setAddrDraft(d=>({...d, country:e.target.value}))}
              />
            </div>

            <textarea
              className="textarea textarea-sm w-full" rows={2} placeholder="Delivery instructions (optional)"
              value={addrDraft.instructions ?? ""} onChange={(e)=>setAddrDraft(d=>({...d, instructions:e.target.value}))}
            />

            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox"
                checked={!!addrDraft.is_default}
                onChange={(e)=>setAddrDraft(d=>({...d, is_default: e.target.checked}))}
              />
              Set as default shipping
            </label>

            {addrMsg && <div className="text-xs text-blue-700">{addrMsg}</div>}

            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={saveAddress} disabled={addrBusy}>
                {addrBusy ? "Saving…" : "Save address"}
              </button>
              <button className="btn btn-sm" onClick={cancelEdit} disabled={addrBusy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="mt-3 space-y-3">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {a.label || a.recipient_name || "Address"}
                  {a.is_default && (
                    <span className="ml-2 text-xs rounded bg-base-200 px-1.5 py-0.5 align-middle">
                      default
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!a.is_default && (
                    <button className="btn btn-xs" onClick={() => onMakeDefault(a.id)} disabled={addrBusy}>
                      Make default
                    </button>
                  )}
                  <button className="btn btn-xs" onClick={() => beginEdit(a)} disabled={addrBusy}>
                    Edit
                  </button>
                  <button className="btn btn-xs" onClick={() => onDeleteAddress(a.id)} disabled={addrBusy}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-sm mt-1">
                <div>{a.recipient_name || ""}{a.recipient_name && a.phone ? " • " : ""}{a.phone || ""}</div>
                <div>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</div>
                <div>{a.city}{a.state ? `, ${a.state}` : ""} {a.postal_code}</div>
                <div>{a.country}</div>
                {a.instructions && (
                  <div className="text-xs text-base-content/70 mt-1">Note: {a.instructions}</div>
                )}
              </div>
            </div>
          ))}
          {!addresses.length && (
            <div className="text-sm text-base-content/70">No addresses yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}