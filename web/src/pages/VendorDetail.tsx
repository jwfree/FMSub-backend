import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../lib/api";
import ProductCard, { type Product } from "../components/ProductCard";

type Location = {
  id: number;
  name?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
};

type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  active: boolean;
  products?: Product[];
  locations?: Location[];
};

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Vendor>(`/vendors/${id}`)
      .then((r) => !cancelled && setVendor(r.data))
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <button onClick={() => navigate(-1)} className="text-sm text-blue-600">
        &larr; Back
      </button>

      <h1 className="text-xl font-semibold mt-2">{vendor.name}</h1>
      {vendor.contact_email && (
        <div className="text-sm text-gray-600">{vendor.contact_email}</div>
      )}

      {/* Locations */}
      {vendor.locations && vendor.locations.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Pickup locations</h2>
          <div className="grid gap-2">
            {vendor.locations.map((loc) => (
              <div key={loc.id} className="rounded-xl border bg-white p-3 text-sm">
                <div className="font-medium">{loc.name || "Location"}</div>
                <div className="text-gray-700">
                  {[loc.address_line1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ")}
                </div>
                {loc.notes && <div className="text-xs text-gray-600 mt-1">{loc.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

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
  );
}