import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import VendorCard, { type Vendor } from "../components/VendorCard";
import ProductCard, { type Product } from "../components/ProductCard";

type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

export default function Browse() {
  const [tab, setTab] = useState<"vendors" | "products">("vendors");

  // ---- vendor mode + geolocation ----
  const [mode, setMode] = useState<"favorites" | "nearby">("favorites");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number>(10);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  // shared UI state
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // vendors
  const [vendors, setVendors] = useState<Page<Vendor> | null>(null);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);

  // products
  const [vendorIdFilter, setVendorIdFilter] = useState<number | "all">("all");
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // ask for location if in nearby mode
  useEffect(() => {
    if (tab !== "vendors" || mode !== "nearby" || coords || geoErr) return;

    if (!("geolocation" in navigator)) {
      setGeoErr("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoErr(null);
      },
      (err) => setGeoErr(err.message || "Location permission denied."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, [tab, mode, coords, geoErr]);

  // fetch vendors
  useEffect(() => {
    if (tab !== "vendors") return;
    let cancelled = false;
    setVendorsLoading(true);
    setVendorsError(null);

    if (mode === "nearby" && !coords) {
      setVendorsLoading(false);
      return () => { cancelled = true; };
    }

    const params: Record<string, any> = { per_page: perPage, page };
    if (q.trim()) params.q = q.trim();
    if (mode === "favorites") params.favorites = 1;
    if (mode === "nearby" && coords) {
      params.lat = coords.lat;
      params.lng = coords.lng;
      params.radius_miles = radius;
    }

    api
      .get<Page<Vendor>>("/vendors", { params })
      .then((r) => !cancelled && setVendors(r.data))
      .catch((e) => !cancelled && setVendorsError(msg(e)))
      .finally(() => !cancelled && setVendorsLoading(false));

    return () => { cancelled = true; };
  }, [tab, q, page, mode, coords, radius]);

  // fetch products
  useEffect(() => {
    if (tab !== "products") return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);

    const params: Record<string, any> = { per_page: perPage, page };
    if (q.trim()) params.q = q.trim();
    if (vendorIdFilter !== "all") params.vendor_id = vendorIdFilter;

    api
      .get<Page<Product>>("/products", { params })
      .then((r) => !cancelled && setProducts(r.data))
      .catch((e) => !cancelled && setProductsError(msg(e)))
      .finally(() => !cancelled && setProductsLoading(false));

    return () => { cancelled = true; };
  }, [tab, q, page, vendorIdFilter]);

  // vendor filter options for products tab
  const vendorOptions = useVendorOptions();

  useEffect(() => { setPage(1); }, [tab, q, vendorIdFilter, mode, radius]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Tabs */}
      <div className="flex rounded-xl bg-base-200 p-1 mb-4">
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "vendors"
              ? "bg-base-100 shadow font-medium"
              : "text-base-content/80"
          }`}
          onClick={() => setTab("vendors")}
        >
          Vendors
        </button>
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "products"
              ? "bg-base-100 shadow font-medium"
              : "text-base-content/80"
          }`}
          onClick={() => setTab("products")}
        >
          Products
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "vendors" ? "Search vendors…" : "Search products…"}
          className="w-full rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                     placeholder:text-base-content/60 focus:outline-none
                     focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
        />

        {tab === "vendors" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("favorites")}
              aria-pressed={mode === "favorites"}
              className={`px-3 py-2 rounded-xl text-sm ${
                mode === "favorites"
                  ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]"
                  : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
              }`}
            >
              Favorites
            </button>
            <button
              onClick={() => setMode("nearby")}
              aria-pressed={mode === "nearby"}
              className={`px-3 py-2 rounded-xl text-sm ${
                mode === "nearby"
                  ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]"
                  : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
              }`}
            >
              Nearby
            </button>

            {mode === "nearby" && (
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[--color-primary]
                           focus:border-[--color-primary]"
              >
                {[5, 10, 15, 25, 50].map((m) => (
                  <option key={m} value={m}>{m} mi</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <select
            value={vendorIdFilter}
            onChange={(e) =>
              setVendorIdFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-[--color-primary]
                       focus:border-[--color-primary]"
          >
            <option value="all">All vendors</option>
            {vendorOptions.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Location help */}
      {tab === "vendors" && mode === "nearby" && !coords && (
        <div className="mb-3 text-xs text-base-content/80">
          {geoErr
            ? `Location error: ${geoErr}. You can switch back to Favorites.`
            : "Requesting your location… If prompted, please allow access."}
        </div>
      )}

      {/* Lists */}
      {tab === "vendors" ? (
        <ListShell
          loading={vendorsLoading}
          error={vendorsError}
          total={vendors?.total}
          page={vendors?.current_page}
          lastPage={vendors?.last_page}
          onPageChange={setPage}
        >
          <div className="grid grid-cols-1 gap-3">
            {vendors?.data.map((v) => <VendorCard key={v.id} vendor={v} />)}
          </div>
        </ListShell>
      ) : (
        <ListShell
          loading={productsLoading}
          error={productsError}
          total={products?.total}
          page={products?.current_page}
          lastPage={products?.last_page}
          onPageChange={setPage}
        >
          <div className="grid grid-cols-1 gap-3">
            {products?.data.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </ListShell>
      )}
    </div>
  );
}

/** Small helpers */
function msg(e: any) {
  return e?.response?.data?.message || e?.message || "Request failed";
}

function ListShell(props: {
  loading: boolean;
  error: string | null;
  total?: number;
  page?: number;
  lastPage?: number;
  onPageChange: (p: number) => void;
  children: React.ReactNode;
}) {
  const { loading, error, children, total, page = 1, lastPage = 1, onPageChange } = props;

  if (loading) return <div className="py-10 text-center text-sm text-base-content/80">Loading…</div>;
  if (error) return <div className="py-10 text-center text-sm text-error">{error}</div>;
  if (!total) return <div className="py-10 text-center text-sm text-base-content/80">No results</div>;

  return (
    <div>
      <div className="text-xs text-base-content/60 mb-2">{total} results</div>
      {children}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1 text-sm rounded border border-base-300 bg-base-100
                       hover:bg-base-200 disabled:opacity-50"
          >
            Prev
          </button>
          <div className="text-sm">Page {page} / {lastPage}</div>
          <button
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 text-sm rounded border border-base-300 bg-base-100
                       hover:bg-base-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function useVendorOptions() {
  const [opts, setOpts] = useState<Vendor[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/vendors", { params: { per_page: 200, with: "none" } })
      .then((r) => !cancelled && setOpts(r.data?.data ?? []))
      .catch(() => void 0);
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => opts, [opts]);
}