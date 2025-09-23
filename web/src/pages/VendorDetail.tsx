import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";   // <-- Link added
import api from "../lib/api";
import ProductCard from "../components/ProductCard";  // <-- ProductCard added

type Variant = { id:number; name?:string; price_cents?:number; is_active?:boolean };
type Product = { id:number; name:string; description?:string; variants?:Variant[]; is_active?:boolean };
type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
  products?: Product[];
};

export default function VendorDetail() {
  const { id } = useParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/vendors/${id}`)
      .then(r => !cancelled && setVendor(r.data))
      .catch(e => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  const qrPng = `${import.meta.env.VITE_API_URL?.replace(/\/+$/,'')}/vendors/${vendor.id}/qr.png`;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero */}
      {vendor.banner_url && (
        <img
          src={vendor.banner_url}
          alt="Banner"
          className="w-full h-40 object-cover rounded-b-2xl"
        />
      )}
      <div className="px-4 py-4 flex items-center gap-3">
        {vendor.photo_url && (
          <img src={vendor.photo_url} alt="Vendor" className="w-14 h-14 rounded-full object-cover border" />
        )}
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{vendor.name}</h1>
          <div className="text-xs text-gray-600">
            {vendor.contact_email && <span>{vendor.contact_email}</span>}
            {vendor.contact_email && vendor.contact_phone && <span> • </span>}
            {vendor.contact_phone && <span>{formatPhone(vendor.contact_phone)}</span>}
          </div>
        </div>
        <a
          href={qrPng}
          target="_blank"
          rel="noreferrer"
          className="text-xs rounded border px-3 py-2 hover:bg-gray-50"
        >
          QR
        </a>
      </div>

      {/* Products list (reuse your existing rendering) */}
      <div className="px-4 pb-6">


      {/* Products */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Products</h2>
        {vendor.products && vendor.products.length ? (
          <div className="grid grid-cols-1 gap-3">
            {vendor.products.map((p) => (
              <Link key={p.id} to={`/products/${p.id}`}>
                <ProductCard product={p} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No products yet.</div>
        )}
      </div>

      </div>
    </div>
  );
}

function formatPhone(p?: string | null) {
  if (!p) return "";
  const digits = p.replace(/\D+/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return p;
}