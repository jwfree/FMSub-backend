// web/src/pages/VendorProductNew.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { ensureJpeg } from "../lib/convertHeic";
import FilePicker from "../components/FilePicker";
import { buildOptionsFromUi } from "../lib/subscriptionOptions";


type VendorSummary = { id: number; name: string };

export default function VendorProductNew() {
  const { id } = useParams(); // vendor id
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<VendorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // product fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [active, setActive] = useState(true);

  // first (required) variant
  const [variantName, setVariantName] = useState("");
  const [price, setPrice] = useState<string>(""); // dollars text input
  const [currency, setCurrency] = useState("USD");
  const [variantActive, setVariantActive] = useState(true);

  // image handling
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageWarn, setImageWarn] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  // subscription choices UI
  const [subOnce, setSubOnce] = useState(true);       // default to weekly/biweekly/monthly + once
  const [subDaily, setSubDaily] = useState(false);
  const [subWeekly, setSubWeekly] = useState(true);
  const [subBiweekly, setSubBiweekly] = useState(true);
  const [subMonthly, setSubMonthly] = useState(true);

  const [subDaysEnabled, setSubDaysEnabled] = useState(false);
  const [subDays, setSubDays] = useState<number>(3);

  const [subWeeksEnabled, setSubWeeksEnabled] = useState(false);
  const [subWeeks, setSubWeeks] = useState<number>(3);

  const [subMonthsEnabled, setSubMonthsEnabled] = useState(false);
  const [subMonths, setSubMonths] = useState<number>(2);


  // load vendor
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api
      .get(`/vendors/${id}?with=none`)
      .then((r) => {
        if (cancel) return;
        setVendor({ id: r.data.id, name: r.data.name });
      })
      .catch((e) => !cancel && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [id]);

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
  setImagePreview(null);
  setImageFile(null);
  if (!f) return;
  const { file, previewUrl, warning } = await ensureJpeg(f, {
    quality: 0.9,
    maxWidth: 3000,
    maxHeight: 3000,
    maxSizeMB: 8,
  });
  objectUrls.current.push(previewUrl);
  setImageFile(file);
  setImagePreview(previewUrl);
  setImageWarn(warning || null);
}

  function toCents(text: string): number | null {
    const normalized = text.replace(/[^\d.]/g, "");
    if (!normalized) return null;
    const n = Number(normalized);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  }

  async function submit() {
    if (!vendor) return;
    setErr(null);

    // basic client validation
    const cents = toCents(price);
    if (!name.trim()) {
      setErr("Product name is required.");
      return;
    }
    if (!unit.trim()) {
      setErr("Unit is required (e.g. dozen, lb, bag).");
      return;
    }
    if (cents === null) {
      setErr("Valid price is required.");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      if (description) fd.append("description", description);
      fd.append("unit", unit);
      fd.append("active", active ? "1" : "0");

      // first variant — **cents only**
      fd.append("variant[name]", variantName || unit);
      fd.append("variant[price_cents]", String(cents));
      fd.append("variant[currency]", (currency || "USD").toUpperCase());
      fd.append("variant[active]", variantActive ? "1" : "0");

      if (imageFile) fd.append("image", imageFile);

      const subOptions = buildOptionsFromUi({
        once: subOnce,
        daily: subDaily,
        weekly: subWeekly,
        biweekly: subBiweekly,
        monthly: subMonthly,
        daysEnabled: subDaysEnabled, days: subDays,
        weeksEnabled: subWeeksEnabled, weeks: subWeeks,
        monthsEnabled: subMonthsEnabled, months: subMonths,
      });

      // ...
      subOptions.forEach((opt, i) => {
        fd.append(`subscription_options[${i}][value]`, opt.value);
        if (opt.label) fd.append(`subscription_options[${i}][label]`, opt.label);
      });

      await api.post(`/vendors/${vendor.id}/products`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      navigate(`/vendors/${vendor.id}`);
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        (e?.response?.data?.errors &&
          (Object.values(e.response.data.errors) as string[][]).flat().join(" ")) ||
        "Create failed";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (err && !vendor) return <div className="p-4 text-error">{err}</div>;
  if (!vendor) return <div className="p-4">Not found</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Add product</h1>
        <Link className="text-sm underline" to={`/vendors/${vendor.id}`}>
          Back to vendor
        </Link>
      </div>

      {err && <div className="mb-3 text-sm text-error">{err}</div>}

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
        </div>

        <hr />

        {/* First variant */}
        <div className="font-medium text-sm">First variant</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
           <div>
            <label className="block text-xs text-base-content/80 mb-1">Variant name</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder="e.g. 12 eggs"
            />
          </div>
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Price (USD)</label>
            <input
              className="w-full rounded border p-2 text-sm"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 5.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-base-content/80 mb-1">Currency</label>
            <input
              className="w-full rounded border p-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-base-content">
              <input
                type="checkbox"
                className="rounded"
                checked={variantActive}
                onChange={(e) => setVariantActive(e.target.checked)}
              />
              Active
            </label>
          </div>
        </div>

        <hr />

        <div>
          <div className="font-medium text-sm mb-2">Subscription options</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={subOnce} onChange={(e)=>setSubOnce(e.target.checked)} />
              One time
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={subDaily} onChange={(e)=>setSubDaily(e.target.checked)} />
              Daily
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={subWeekly} onChange={(e)=>setSubWeekly(e.target.checked)} />
              Weekly
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={subBiweekly} onChange={(e)=>setSubBiweekly(e.target.checked)} />
              Every 2 weeks
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={subMonthly} onChange={(e)=>setSubMonthly(e.target.checked)} />
              Monthly
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={subDaysEnabled} onChange={(e)=>setSubDaysEnabled(e.target.checked)} />
              <span className="text-sm">Every</span>
              <input
                type="number"
                min={1}
                className="input input-sm w-20"
                value={subDays}
                onChange={(e)=>setSubDays(Math.max(1, Math.floor(Number(e.target.value)||1)))}
              />
              <span className="text-sm">days</span>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={subWeeksEnabled} onChange={(e)=>setSubWeeksEnabled(e.target.checked)} />
              <span className="text-sm">Every</span>
              <input
                type="number"
                min={1}
                className="input input-sm w-20"
                value={subWeeks}
                onChange={(e)=>setSubWeeks(Math.max(1, Math.floor(Number(e.target.value)||1)))}
              />
              <span className="text-sm">weeks</span>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={subMonthsEnabled} onChange={(e)=>setSubMonthsEnabled(e.target.checked)} />
              <span className="text-sm">Every</span>
              <input
                type="number"
                min={1}
                className="input input-sm w-20"
                value={subMonths}
                onChange={(e)=>setSubMonths(Math.max(1, Math.floor(Number(e.target.value)||1)))}
              />
              <span className="text-sm">months</span>
            </div>
          </div>
          <div className="text-xs text-base-content/70 mt-1">
            These choices control the frequency dropdown customers see on the product page.
          </div>
        </div>


        <hr />

        {/* Image */}
        <div>
          <FilePicker
            accept="image/*,.heic,.heif"
            onPick={onPickImage}
            previewUrl={imagePreview}
            fileName={imageFile?.name ?? null}   // optional, but nice to show
            warn={imageWarn}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Creating…" : "Create product"}
          </button>
          <Link to={`/vendors/${vendor.id}`} className="btn btn-outline">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}