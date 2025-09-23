import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../lib/api";

type Variant = {
  id: number;
  name?: string;
  sku?: string;
  price_cents?: number;
  active?: boolean;
};

type Product = {
  id: number;
  name: string;
  description?: string;
  active?: boolean;
  variants?: Variant[];
};

type Location = {
  id: number;
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  notes?: string | null;
};

type Vendor = {
  id: number;
  name: string;
  active?: boolean;
  products?: Product[];
  locations?: Location[];
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Vendor>(`/vendors/${id}`)
      .then((r) => !cancelled && setVendor(r.data))
      .catch((e) => !cancelled && setErr(e?.response?.data?.message || e.message || "Failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const products = useMemo(() => vendor?.products ?? [], [vendor]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err || !vendor) return <div className="p-4 text-red-600">{err ?? "Not found"}</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <button onClick={() => nav(-1)} className="text-sm text-blue-600">
        &larr; Back
      </button>

      <h1 className="text-2xl font-semibold mt-2">{vendor.name}</h1>

      {/* Locations */}
      {!!vendor.locations?.length && (
        <div className="mt-4 rounded-2xl border p-4 bg-white">
          <div className="text-sm font-medium mb-2">Pickup locations</div>
          <ul className="space-y-2">
            {vendor.locations.map((loc) => (
              <li key={loc.id} className="text-sm">
                <div className="font-medium">{loc.name}</div>
                <div className="text-gray-600">
                  {[loc.address1, loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ")}
                </div>
                {loc.notes && <div className="text-gray-600 mt-1">{loc.notes}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Products */}
      <div className="mt-6">
        <div className="text-sm font-medium mb-2">Products</div>
        {products.length === 0 ? (
          <div className="text-sm text-gray-600">No products yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {products.map((p) => {
              // show cheapest price if available
              const cheapest = p.variants?.length
                ? [...p.variants].sort(
                    (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity)
                  )[0]
                : undefined;

              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  className="block rounded-2xl shadow p-4 bg-white hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{p.name}</h3>
                    </div>
                    {!!cheapest?.price_cents && (
                      <div className="text-sm font-medium shrink-0">
                        {centsToDollars(cheapest.price_cents)}
                      </div>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm text-gray-700 mt-2 line-clamp-2">{p.description}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}