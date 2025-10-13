import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { getMyFavoriteVendors, favoriteVendor, unfavoriteVendor } from "../lib/api";
import VendorCard, { type Vendor } from "../components/VendorCard";
import ProductCard, { type Product } from "../components/ProductCard";
import { useSearchParams } from "react-router-dom";

type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthed = !!localStorage.getItem("token");

  // ----- initial state from URL -----
  const initialTab = ((): "vendors" | "products" => {
    const t = (searchParams.get("tab") || "").toLowerCase();
    return t === "products" ? "products" : "vendors";
  })();

  const initialMode = ((): "favorites" | "nearby" | "all" => {
    const m = (searchParams.get("mode") || "").toLowerCase();
    if (m === "favorites" || m === "nearby" || m === "all") return m;
    return isAuthed ? "favorites" : "nearby";
  })();

  const initialRadius = ((): number => {
    const r = Number(searchParams.get("radius"));
    return Number.isFinite(r) && r > 0 ? r : 10;
  })();

  const initialQ = searchParams.get("q") ?? "";
  const initialVendorFilter = ((): number | "all" => {
    const v = searchParams.get("vendor");
    if (!v || v === "all") return "all";
    const n = Number(v);
    return Number.isFinite(n) ? n : "all";
  })();

  const initialPage = ((): number => {
    const p = Number(searchParams.get("page"));
    return Number.isFinite(p) && p > 0 ? p : 1;
  })();

  // ----- state -----
  const [tab, setTab] = useState<"vendors" | "products">(initialTab);
  const [mode, setMode] = useState<"favorites" | "nearby" | "all">(initialMode);
  const [radius, setRadius] = useState<number>(initialRadius);

  const [authPrompt, setAuthPrompt] = useState(false);
  const nextUrl = `${window.location.pathname}${window.location.search}`;

  // vendor geolocation
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const autoSwitchedRef = useRef(false);
  const [autoSwitchNote, setAutoSwitchNote] = useState<string | null>(null);

  // shared UI state
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(initialPage);
  const perPage = 20;

  // vendors
  const [vendors, setVendors] = useState<Page<Vendor> | null>(null);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);

  // favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  // products
  const [vendorIdFilter, setVendorIdFilter] = useState<number | "all">(initialVendorFilter);
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // ----- keep key UI state in the URL (so Back restores the same filtered list) -----
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);

    // always persist tab
    sp.set("tab", tab);

    // shared search + page
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");

    if (page > 1) sp.set("page", String(page));
    else sp.delete("page");

    if (tab === "vendors") {
      sp.set("mode", mode);
      if (mode === "nearby") sp.set("radius", String(radius));
      else sp.delete("radius");
      // vendor-only stuff not relevant here
      sp.delete("vendor");
    } else {
      // products tab: persist vendor filter
      if (vendorIdFilter === "all") sp.delete("vendor");
      else sp.set("vendor", String(vendorIdFilter));
      // vendor tab fields not relevant here
      sp.delete("mode");
      sp.delete("radius");
    }

    setSearchParams(sp, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode, radius, q, page, vendorIdFilter]);

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

    if (!isAuthed && mode === "favorites") {
      setMode("nearby");
      setVendorsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (mode === "nearby" && !coords) {
      setVendorsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const params: Record<string, any> = { per_page: perPage, page };
    if (q.trim()) params.q = q.trim();
    if (mode === "nearby" && coords) {
      params.lat = coords.lat;
      params.lng = coords.lng;
      params.radius_miles = radius;
    }

    Promise.all([
      api.get<Page<Vendor>>("/vendors", { params }),
      getMyFavoriteVendors().catch(() => [] as number[]),
    ])
      .then(([vRes, favIds]) => {
        if (cancelled) return;

        const favSet = new Set(favIds as number[]);
        setFavoriteIds(favSet);

        const base = vRes.data?.data ?? [];
        const filtered = mode === "favorites" ? base.filter((v) => favSet.has(v.id)) : base;

        if (
          !isAuthed &&
          mode === "nearby" &&
          !q.trim() &&
          (vRes.data?.total ?? 0) === 0 &&
          !autoSwitchedRef.current
        ) {
          autoSwitchedRef.current = true;
          setMode("all");
          setAutoSwitchNote("No nearby vendors found — showing all vendors instead.");
          return;
        } else {
          setAutoSwitchNote(null);
        }

        const total = filtered.length;
        const last = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        setVendors({
          data: paged,
          current_page: page,
          last_page: last,
          total,
        });
      })
      .catch((e) => !cancelled && setVendorsError(msg(e)))
      .finally(() => !cancelled && setVendorsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tab, q, page, mode, coords, radius, isAuthed]);

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

  // vendor filter options for products tab
  const vendorOptions = useVendorOptions();

  // reset page on major filter changes
  useEffect(() => {
    setPage(1);
  }, [tab, q, vendorIdFilter, mode, radius]);

  async function handleToggleFavorite(vendorId: number, next: boolean) {
    if (!localStorage.getItem("token")) {
      setAuthPrompt(true);
      return;
    }

    setFavoriteIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(vendorId);
      else copy.delete(vendorId);
      return copy;
    });

    try {
      if (next) await favoriteVendor(vendorId);
      else await unfavoriteVendor(vendorId);
    } catch (e: any) {
      setFavoriteIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(vendorId);
        else copy.add(vendorId);
        return copy;
      });

      if (e?.response?.status === 401) {
        setAuthPrompt(true);
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Tabs */}
      <div className="flex rounded-xl bg-base-200 p-1 mb-4">
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "vendors" ? "bg-base-100 shadow font-medium" : "text-base-content/80"
          }`}
          onClick={() => setTab("vendors")}
        >
          Vendors
        </button>
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${
            tab === "products" ? "bg-base-100 shadow font-medium" : "text-base-content/80"
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
                aria-label="Radius in miles"
              >
                {[5, 10, 15, 25, 50].map((m) => (
                  <option key={m} value={m}>
                    {m} mi
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setMode("all")}
              aria-pressed={mode === "all"}
              className={`px-3 py-2 rounded-xl text-sm ${
                mode === "all"
                  ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]"
                  : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"
              }`}
            >
              All
            </button>
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
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Auth prompt */}
      {authPrompt && (
        <div className="mb-3 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/80 flex items-center justify-between">
          <div>
            Want to save favorites?{" "}
            <a className="underline text-primary" href={`/login?next=${encodeURIComponent(nextUrl)}`}>
              Log in
            </a>{" "}
            or{" "}
            <a className="underline text-primary" href={`/signup?next=${encodeURIComponent(nextUrl)}`}>
              create an account
            </a>
            .
          </div>
          <button
            className="ml-3 rounded border px-2 py-1 hover:bg-base-200"
            onClick={() => setAuthPrompt(false)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Location help / auto-switch note */}
      {tab === "vendors" && mode === "nearby" && !coords && (
        <div className="mb-3 text-xs text-base-content/80">
          {geoErr
            ? `Location error: ${geoErr}. You can switch back to Favorites or All.`
            : "Requesting your location… If prompted, please allow access."}
        </div>
      )}
      {autoSwitchNote && (
        <div className="mb-3 text-xs text-base-content/80">{autoSwitchNote}</div>
      )}

      {/* Lists */}
      {tab === "vendors" ? (
        <>
          {mode === "favorites" && !vendorsLoading && !vendorsError && (vendors?.total ?? 0) === 0 ? (
            <div className="py-10 text-center text-sm text-base-content/80">
              You have no favorite vendors yet.
            </div>
          ) : (
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
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    favorited={favoriteIds.has(v.id)}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </ListShell>
          )}
        </>
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
              <ProductCard
                key={p.id}
                product={p}
                to={`/products/${p.id}`}
                state={{ from: window.location.pathname + window.location.search }}
              />
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

  if (loading)
    return <div className="py-10 text-center text-sm text-base-content/80">Loading…</div>;
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
          <div className="text-sm">
            Page {page} / {lastPage}
          </div>
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
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => opts, [opts]);
}