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

  // fetch vendors (for list and for the product filter dropdown)
  useEffect(() => {
    if (tab !== "vendors") return;
    let cancelled = false;
    setVendorsLoading(true);
    setVendorsError(null);

    const params: Record<string, any> = { per_page: perPage, page };
    if (q.trim()) params.q = q.trim();

    api
      .get<Page<Vendor>>("/vendors", { params })
      .then((r) => !cancelled && setVendors(r.data))
      .catch((e) => !cancelled && setVendorsError(msg(e)))
      .finally(() => !cancelled && setVendorsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tab, q, page]);

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

    return () => {
      cancelled = true;
    };
  }, [tab, q, page, vendorIdFilter]);

  // used to populate vendor filter on Products tab
  const vendorOptions = useVendorOptions();

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [tab, q, vendorIdFilter]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 mb-4">
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "vendors" ? "bg-white shadow font-medium" : "text-gray-600"
          }`}
          onClick={() => setTab("vendors")}
        >
          Vendors
        </button>
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "products" ? "bg-white shadow font-medium" : "text-gray-600"
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
          className="w-full rounded-xl border p-2 text-sm"
        />
        {tab === "products" && (
          <select
            value={vendorIdFilter}
            onChange={(e) =>
              setVendorIdFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="rounded-xl border p-2 text-sm"
          >
            <option value="all">All vendors</option>
            {vendorOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

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
            {vendors?.data.map((v) => (
              <VendorCard key={v.id} vendor={v} />
            ))}
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
            {products?.data.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
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

  if (loading) return <div className="py-10 text-center text-sm text-gray-600">Loading…</div>;
  if (error) return <div className="py-10 text-center text-sm text-red-600">{error}</div>;
  if (!total) return <div className="py-10 text-center text-sm text-gray-600">No results</div>;

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">{total} results</div>
      {children}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1 text-sm rounded border disabled:opacity-50"
          >
            Prev
          </button>
          <div className="text-sm">
            Page {page} / {lastPage}
          </div>
          <button
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 text-sm rounded border disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/** Fetch vendor options for the Products vendor filter (lightweight, with=none) */
function useVendorOptions() {
  const [opts, setOpts] = useState<Vendor[]>([]);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/vendors", { params: { per_page: 200, with: "none" } })
      .then((r) => !cancelled && setOpts(r.data?.data ?? []))
      .catch(() => void 0);

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => opts, [opts]);
}