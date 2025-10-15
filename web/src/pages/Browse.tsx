import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getMyFavoriteVendors, favoriteVendor, unfavoriteVendor } from "../lib/api";
import VendorCard, { type Vendor } from "../components/VendorCard";
import ProductCard, { type Product as ProductCardType } from "../components/ProductCard";

const FAVORITES_VERSION_KEY = "__favorites_version";

/** API shapes we’ll use (with a few optional fields for progressive enhancement) */
type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

type VendorWithDistance = Vendor & {
  distance_miles?: number; // provided when using nearby on backend
};

type Product = ProductCardType & {
  // optional fields backend can provide (UI will fall back if absent)
  min_price_cents?: number;
  distance_miles?: number;       // distance of its vendor (server can join)
  // NEW preferred fields from server
  any_available?: number;        // 1 or 0
  available_qty?: number | string; // summed qty; backend may send string
  // Legacy fallback (avoid using except as a backup)
  available_today?: number;

  // common flag already present on product
  allow_waitlist?: boolean;
};

/** Small helpers */
function msg(e: any) {
  return e?.response?.data?.message || e?.message || "Request failed";
}
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Map UI availability to server param */
function mapAvailabilityForServer(a: "in_or_waitlist" | "in" | "out_any"): "in_or_out_with_waitlist" | "in_only" | "out_any" | "both" {
  if (a === "in") return "in_only";
  if (a === "out_any") return "out_any";
  // default UI option
  return "in_or_out_with_waitlist";
}

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

  const initialRadiusKind = ((): "preset" | "other" => {
    const k = (searchParams.get("radiusKind") || "").toLowerCase();
    return k === "other" ? "other" : "preset";
  })();

  const initialVendorView = ((): "cards" | "list" => {
    const v = (searchParams.get("vendorView") || "").toLowerCase();
    return v === "list" ? "list" : "cards";
  })();

  const initialProductView = ((): "cards" | "list" => {
    const v = (searchParams.get("productView") || "").toLowerCase();
    return v === "list" ? "list" : "cards";
  })();

  const initialAvailability = ((): "in_or_waitlist" | "in" | "out_any" => {
    const a = (searchParams.get("availability") || "").toLowerCase();
    if (a === "in" || a === "out_any" || a === "in_or_waitlist") return a as any;
    return "in_or_waitlist"; // default
  })();

  const initialOrderBy = ((): "name" | "price" | "distance" => {
    const o = (searchParams.get("orderBy") || "").toLowerCase();
    return o === "price" || o === "distance" ? (o as any) : "name";
  })();

  // NEW: separate query strings (keep old ?q=… for back-compat as vendor filter)
  const initialQVendors = ((): string => {
    const qv = searchParams.get("qv");
    if (qv !== null) return qv;
    return searchParams.get("q") ?? "";
  })();
  const initialQProducts = searchParams.get("qp") ?? "";

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

  // Vendors-side state
  const [mode, setMode] = useState<"favorites" | "nearby" | "all">(initialMode);
  const [radius, setRadius] = useState<number>(initialRadius);
  const [radiusKind, setRadiusKind] = useState<"preset" | "other">(initialRadiusKind);
  const presetRadii = [5, 10, 15, 25, 50];

  const [vendorView, setVendorView] = useState<"cards" | "list">(initialVendorView);

  // Products-side state
  const [productView, setProductView] = useState<"cards" | "list">(initialProductView);
  const [availability, setAvailability] = useState<"in_or_waitlist" | "in" | "out_any">(initialAvailability);
  const [orderBy, setOrderBy] = useState<"name" | "price" | "distance">(initialOrderBy);
  const [vendorIdFilter, setVendorIdFilter] = useState<number | "all">(initialVendorFilter);

  // NEW: separate search text
  const [qVendors, setQVendors] = useState(initialQVendors);
  const [qProducts, setQProducts] = useState(initialQProducts);

  // shared UI state
  const [page, setPage] = useState(initialPage);
  const perPage = 20;

  // vendor geolocation
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const autoSwitchedRef = useRef(false);
  const [autoSwitchNote, setAutoSwitchNote] = useState<string | null>(null);

  // vendors
  const [vendors, setVendors] = useState<Page<VendorWithDistance> | null>(null);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  // products
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  const nextUrl = `${window.location.pathname}${window.location.search}`;
  const userToken = localStorage.getItem("token");

  // ----- keep key UI state in the URL -----
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);

    sp.set("tab", tab);

    // persist both searches independently
    if (qVendors.trim()) sp.set("qv", qVendors.trim());
    else sp.delete("qv");
    if (qProducts.trim()) sp.set("qp", qProducts.trim());
    else sp.delete("qp");

    // for backward compatibility: keep `q` as vendors filter if on vendors tab
    if (tab === "vendors") {
      if (qVendors.trim()) sp.set("q", qVendors.trim());
      else sp.delete("q");
    } else {
      // avoid confusion on products tab
      sp.delete("q");
    }

    if (page > 1) sp.set("page", String(page));
    else sp.delete("page");

    if (tab === "vendors") {
      sp.set("mode", mode);
      if (mode === "nearby") {
        sp.set("radius", String(radius));
        sp.set("radiusKind", radiusKind);
      } else {
        sp.delete("radius");
        sp.delete("radiusKind");
      }
      sp.set("vendorView", vendorView);
      // products-only keys
      sp.delete("vendor");
      sp.delete("availability");
      sp.delete("orderBy");
      sp.delete("productView");
    } else {
      // products tab: persist vendor selection + product prefs
      if (vendorIdFilter === "all") sp.delete("vendor");
      else sp.set("vendor", String(vendorIdFilter));
      sp.set("availability", availability);
      sp.set("orderBy", orderBy);
      sp.set("productView", productView);
      // vendor-only keys
      sp.delete("mode");
      sp.delete("radius");
      sp.delete("radiusKind");
      sp.delete("vendorView");
    }

    setSearchParams(sp, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    mode,
    radius,
    radiusKind,
    vendorView,
    qVendors,
    qProducts,
    page,
    vendorIdFilter,
    availability,
    orderBy,
    productView,
  ]);

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
    if (qVendors.trim()) params.q = qVendors.trim();
    if (mode === "nearby" && coords) {
      params.lat = coords.lat;
      params.lng = coords.lng;
      params.radius_miles = radius;
    }
    if (mode === "favorites" && userToken) {
      params.favorites = 1; // server will respect only if authed
    }

  Promise.all([
    api.get<Page<VendorWithDistance>>("/vendors", { params }),
    userToken ? getMyFavoriteVendors().catch(() => [] as number[]) : Promise.resolve([] as number[]),
  ])
 
      .then(([vRes, favIds]) => {
        if (cancelled) return;

        const mappedIds = (favIds as any[]).map((v) =>
          typeof v === "number" ? v : v?.id
        );
        const favSet = new Set<number>(mappedIds.filter(Boolean) as number[]);
        setFavoriteIds(favSet);

        const base = vRes.data?.data ?? [];

        // Did the server actually respect favorites?
        const serverRespectedFavorites =
          mode === "favorites" &&
          base.length > 0 &&
          base.every((v) => favSet.has(v.id));

        // Final list we’ll show
        const list =
          mode === "favorites" && !serverRespectedFavorites
            ? base.filter((v) => favSet.has(v.id)) // client-side fallback
            : base;

        // Auto-switch note logic (unchanged)
        if (
          !isAuthed &&
          mode === "nearby" &&
          !qVendors.trim() &&
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

        // Pagination: if we filtered locally, rebuild pages client-side
        const didClientFilter = mode === "favorites" && !serverRespectedFavorites;

        const total = didClientFilter ? list.length : (vRes.data?.total ?? list.length);
        const last = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const data = didClientFilter ? list.slice(start, start + perPage) : list;

        setVendors({
          data,
          current_page: didClientFilter ? page : (vRes.data?.current_page ?? page),
          last_page: didClientFilter ? last : (vRes.data?.last_page ?? last),
          total,
        });
      })

      .catch((e) => !cancelled && setVendorsError(msg(e)))
      .finally(() => !cancelled && setVendorsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tab, qVendors, page, mode, coords, radius, isAuthed, userToken]);

  // fetch products — server-driven by current vendor set
  useEffect(() => {
    if (tab !== "products") return;

    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);

    // 1) Determine vendor_ids the Products tab should consider.
    const getVendorsForProducts = async (): Promise<number[]> => {
      // If a specific vendor is selected, we’re done.
      if (vendorIdFilter !== "all") return [vendorIdFilter];

      // Else we mimic the Vendor tab filtering to fetch the vendor IDs.
      const vParams: Record<string, any> = { per_page: 100, page: 1 };
      if (qVendors.trim()) vParams.q = qVendors.trim();

      // choose a “vendor mode” for products list – follow the same defaults a user would see on vendor tab
      const effectiveMode =
        (searchParams.get("mode") as any) ?? (isAuthed ? "favorites" : "nearby");

      if (effectiveMode === "nearby") {
        // if we had coords earlier, reuse; otherwise ask (soft-fail if user denied)
        if (!coords && "geolocation" in navigator) {
          try {
            await new Promise<void>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  resolve();
                },
                () => resolve(), // ignore error for products
                { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
              );
            });
          } catch {}
        }
        if (coords) {
          vParams.lat = coords.lat;
          vParams.lng = coords.lng;
          vParams.radius_miles = radius;
        }
      }
      if (effectiveMode === "favorites" && userToken) {
        vParams.favorites = 1;
      }

      try {
        const r = await api.get<Page<VendorWithDistance>>("/vendors", { params: vParams });
        return (r.data?.data ?? []).map((v) => v.id);
      } catch {
        return [];
      }
    };

    (async () => {
      const vendorIds = await getVendorsForProducts();

      const pParams: Record<string, any> = {
        per_page: perPage,
        page,
        order_by: orderBy,        // server may use this
        availability: mapAvailabilityForServer(availability),
        date: todayISO(),         // for availability computation
      };
      if (qProducts.trim()) pParams.q = qProducts.trim();

      // Prefer server-side filtering via vendor_ids if we have some.
      if (vendorIds.length) pParams.vendor_ids = vendorIds.join(",");

      try {
        const res = await api.get<Page<Product>>("/products", { params: pParams });
        if (cancelled) return;

        // Trust the server’s filtering & pagination.
        // (Optionally, keep a defensive vendor filter if server ever ignores vendor_ids.)
        let items = res.data.data;
        if (vendorIds.length && !items.every((p) => vendorIds.includes(p.vendor?.id ?? -9999))) {
          items = items.filter((p) => vendorIds.includes(p.vendor?.id ?? -9999));
        }

        setProducts({
          data: items,
          current_page: res.data.current_page,
          last_page: res.data.last_page,
          total: res.data.total,
        });
      } catch (e) {
        if (!cancelled) setProductsError(msg(e));
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, qVendors, qProducts, page, vendorIdFilter, availability, orderBy, radius, coords, isAuthed, userToken]);

  // reset page on major filter changes
  useEffect(() => {
    setPage(1);
  }, [tab, qVendors, qProducts, vendorIdFilter, mode, radius, radiusKind, availability, orderBy, vendorView, productView]);

  async function handleToggleFavorite(vendorId: number, next: boolean) {
    if (!localStorage.getItem("token")) {
      setAuthPrompt(true);
      return;
    }
    // optimistic update
    setFavoriteIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(vendorId);
      else copy.delete(vendorId);
      return copy;
    });
    try {
      if (next) await favoriteVendor(vendorId);
      else await unfavoriteVendor(vendorId);
      // bump version in localStorage
      const ver = Number(localStorage.getItem(FAVORITES_VERSION_KEY) || "0") + 1;
      localStorage.setItem(FAVORITES_VERSION_KEY, ver.toString());
    } catch (e: any) {
      // revert
      setFavoriteIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(vendorId);
        else copy.add(vendorId);
        return copy;
      });
      if (e?.response?.status === 401) setAuthPrompt(true);
    }
  }

  const [authPrompt, setAuthPrompt] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Tabs */}
      <div className="flex rounded-xl bg-base-200 p-1 mb-4">
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${tab === "vendors" ? "bg-base-100 shadow font-medium" : "text-base-content/80"}`}
          onClick={() => setTab("vendors")}
        >
          Vendors
        </button>
        <button
          className={`flex-1 py-2 text-sm rounded-lg ${tab === "products" ? "bg-base-100 shadow font-medium" : "text-base-content/80"}`}
          onClick={() => setTab("products")}
        >
          Products
        </button>
      </div>

      {/* Search */}
      {tab === "vendors" ? (
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-nowrap">
            <input
              value={qVendors}
              onChange={(e) => setQVendors(e.target.value)}
              placeholder="Search vendors…"
              className="flex-1 min-w-0 rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                        placeholder:text-base-content/60 focus:outline-none
                        focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
            />
            <div className="flex items-center gap-1 shrink-0">
              <button
                className={`px-2 py-2 rounded-lg border ${vendorView === "cards" ? "bg-base-100 shadow" : "bg-base-200"}`}
                title="Card view"
                onClick={() => setVendorView("cards")}
              >
                ▦
              </button>
              <button
                className={`px-2 py-2 rounded-lg border ${vendorView === "list" ? "bg-base-100 shadow" : "bg-base-200"}`}
                title="List view"
                onClick={() => setVendorView("list")}
              >
                ≡
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Products tab: show vendor filter (top) + product search (below)
        <div className="mb-3 space-y-2">
          {/* Row 1: vendor filter */}
          <input
            value={qVendors}
            onChange={(e) => setQVendors(e.target.value)}
            placeholder="Filter vendors…"
            className="w-full rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                      placeholder:text-base-content/60 focus:outline-none
                      focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
          />

          {/* Row 2: product search + toggles, non-wrapping */}
          <div className="flex items-center gap-2 flex-nowrap">
            <input
              value={qProducts}
              onChange={(e) => setQProducts(e.target.value)}
              placeholder="Search products…"
              className="flex-1 min-w-0 rounded-xl border border-base-300 bg-base-100 p-2 text-sm
                        placeholder:text-base-content/60 focus:outline-none
                        focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
            />
            <div className="flex items-center gap-1 shrink-0">
              <button
                className={`px-2 py-2 rounded-lg border ${productView === "cards" ? "bg-base-100 shadow" : "bg-base-200"}`}
                title="Card view"
                onClick={() => setProductView("cards")}
              >
                ▦
              </button>
              <button
                className={`px-2 py-2 rounded-lg border ${productView === "list" ? "bg-base-100 shadow" : "bg-base-200"}`}
                title="List view"
                onClick={() => setProductView("list")}
              >
                ≡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {tab === "vendors" ? (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setMode("favorites")}
            aria-pressed={mode === "favorites"}
            className={`px-3 py-2 rounded-xl text-sm ${mode === "favorites" ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]" : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"}`}
          >
            Favorites
          </button>

          <button
            onClick={() => setMode("nearby")}
            aria-pressed={mode === "nearby"}
            className={`px-3 py-2 rounded-xl text-sm ${mode === "nearby" ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]" : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"}`}
          >
            Nearby
          </button>

          {mode === "nearby" && (
            <>
              <select
                value={radiusKind === "preset" && presetRadii.includes(radius) ? radius : "other"}
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setRadiusKind("other");
                  } else {
                    setRadiusKind("preset");
                    setRadius(Number(e.target.value));
                  }
                }}
                className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
                aria-label="Radius in miles"
              >
                {presetRadii.map((m) => (
                  <option key={m} value={m}>{m} mi</option>
                ))}
                <option value="other">Other…</option>
              </select>

              {radiusKind === "other" && (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={radius}
                  onChange={(e) => setRadius(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="w-24 rounded-xl border border-base-300 bg-base-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
                  placeholder="miles"
                  aria-label="Custom radius in miles"
                />
              )}
            </>
          )}

          <button
            onClick={() => setMode("all")}
            aria-pressed={mode === "all"}
            className={`px-3 py-2 rounded-xl text-sm ${mode === "all" ? "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary]" : "border border-base-300 bg-base-100 text-base-content hover:bg-base-200"}`}
          >
            All
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* constrain products by a single vendor, otherwise use vendor set computed server-side */}
          <select
            value={vendorIdFilter}
            onChange={(e) => setVendorIdFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
          >
            <option value="all">All vendors (from current filters)</option>
            <VendorOptions />
          </select>

          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as any)}
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
            title="Availability"
          >
            <option value="in_or_waitlist">In stock + Waitlist (default)</option>
            <option value="in">In stock only</option>
            <option value="out_any">Out of stock (all)</option>
          </select>

          <select
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value as any)}
            className="rounded-xl border border-base-300 bg-base-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
            title="Order by"
          >
            <option value="name">Name</option>
            <option value="price">Price</option>
            <option value="distance">Distance</option>
          </select>
        </div>
      )}

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
              {vendorView === "cards" ? (
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
              ) : (
                <div className="divide-y divide-base-300 rounded-xl border border-base-300 bg-base-100">
                  {vendors?.data.map((v) => (
                    <VendorRow
                      key={v.id}
                      vendor={v}
                      favorited={favoriteIds.has(v.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}
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
          {productView === "cards" ? (
            <div className="grid grid-cols-1 gap-3">
              {products?.data.map((p) => (
                <ProductCard
                  key={p.id}
                  product={{
                    ...p,
                    vendor: p.vendor ? p.vendor : undefined,
                  }}
                  to={`/products/${p.id}`}
                  state={{ from: window.location.pathname + window.location.search }}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-base-300 rounded-xl border border-base-300 bg-base-100">
              {products?.data.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </div>
          )}
        </ListShell>
      )}
    </div>
  );
}

/** List shell with paging */
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
            className="px-3 py-1 text-sm rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
          >
            Prev
          </button>
          <div className="text-sm">
            Page {page} / {lastPage}
          </div>
          <button
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 text-sm rounded border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact vendor row for “list” view */
function VendorRow({
  vendor,
  favorited,
  onToggleFavorite,
}: {
  vendor: Vendor & { distance_miles?: number };
  favorited?: boolean;
  onToggleFavorite?: (vendorId: number, next: boolean) => void;
}) {
  const next = !favorited;
  return (
    <a
      href={`/vendors/${vendor.id}`}
      className="flex items-center gap-3 px-3 py-2 hover:bg-base-200"
    >
      <div className="flex-1 truncate">
        <span className="font-medium">{vendor.name}</span>
        {typeof vendor?.distance_miles === "number" && (
          <span className="ml-2 text-xs text-base-content/70">
            {vendor.distance_miles.toFixed(1)} mi
          </span>
        )}
      </div>
      <button
        aria-label={favorited ? "Unfavorite" : "Favorite"}
        className="ml-2 text-lg"
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite?.(vendor.id, next);
        }}
      >
        <span className={favorited ? "text-[--color-primary]" : "text-base-content/60"}>
          {favorited ? "♥" : "♡"}
        </span>
      </button>
    </a>
  );
}

/** Compact product row for “list” view */
function ProductRow({ product }: { product: Product }) {
  const minPrice =
    product.min_price_cents ??
    (product.variants?.length ? Math.min(...product.variants.map(v => v.price_cents ?? Infinity)) : undefined);

  const distance = product.distance_miles;

  // Prefer new fields; fallback to legacy if ever missing
  const anyAvailable = Number(product.any_available ?? (product.available_today ?? 0)) > 0;
  const availableQty = Number(product.available_qty ?? 0);

  return (
    <a
      href={`/products/${product.id}`}
      className="flex items-center gap-3 px-3 py-2 hover:bg-base-200"
    >
      <div className="flex-1 min-w-0">
        <div className="truncate">
          <span className="font-medium">{product.name}</span>
          {product.vendor?.name && (
            <span className="ml-2 text-xs text-base-content/70">({product.vendor.name})</span>
          )}
        </div>
        <div className="text-xs text-base-content/70">
          {typeof distance === "number" && <span>{distance.toFixed(1)} mi · </span>}
          {typeof minPrice === "number" && <span>${(minPrice / 100).toFixed(2)}</span>}
          <span
            className={`ml-2 ${
              anyAvailable ? "text-success" : product.allow_waitlist ? "text-warning" : "text-error"
            }`}
          >
            {anyAvailable
              ? `In stock${availableQty ? ` (${availableQty})` : ""}`
              : product.allow_waitlist
              ? "Out of stock — Waitlist"
              : "Out of stock"}
          </span>
        </div>
      </div>
      <span className="text-sm text-primary">View →</span>
    </a>
  );
}

/** Vendor options dropdown (used on Products tab’s single-vendor filter) */
function VendorOptions() {
  const [opts, setOpts] = useState<Vendor[]>([]);
  useEffect(() => {
    api
      .get("/vendors", { params: { per_page: 200, with: "none" } })
      .then((r) => setOpts(r.data?.data ?? []))
      .catch(() => void 0);
  }, []);
  const stable = useMemo(() => opts, [opts]);
  return (
    <>
      {stable.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </>
  );
}