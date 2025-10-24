// web/src/App.tsx
import { useEffect, useState, useRef } from "react";
import {
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import api from "./lib/api";
import Browse from "./pages/Browse";
import ProductDetail from "./pages/ProductDetail";
import VendorDetail from "./pages/VendorDetail";
import MySubscriptions from "./pages/MySubscriptions";
import Account from "./pages/Account";
import VendorManage from "./pages/VendorManage";
import VendorNew from "./pages/VendorNew";
import VendorProductNew from "./pages/VendorProductNew";
import VendorProductEdit from "./pages/VendorProductEdit";
import ThemeSwitcher from "./components/ThemeSwitcher";
import VendorInventory from "./pages/VendorInventory";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationsBell from "./components/NotificationsBell";
import Lightbox from "./components/Lightbox";
import { UserCircle } from "lucide-react";

type Me = { id: number; name: string; email: string };

function useAuth() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      api
        .get("/me")
        .then((res) => setMe(res.data))
        .catch(() => {
          localStorage.removeItem("token");
          delete (api.defaults.headers as any).Authorization;
          setMe(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const token = res.data.token as string;
    localStorage.setItem("token", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    const meRes = await api.get("/me");
    setMe(meRes.data);
    return meRes.data as Me;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("token");
    delete (api.defaults.headers as any).Authorization;
    setMe(null);
  };

  return { me, loading, login, logout, setMe };
}

/* ───────────────────────── User Menu ───────────────────────── */

function UserMenu({
  me,
  next = "/browse",
  onLogout,
}: {
  me: Me | null;
  next?: string;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendors, setVendors] = useState<Array<{ id: number; name: string }>>([]);
  
  
  // 👇 ref + outside-click handler
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onDocKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  // Lightboxes
  const [qrVendorId, setQrVendorId] = useState<number | null>(null);
  const [flyerVendorId, setFlyerVendorId] = useState<number | null>(null);

  // base API (for /flyer.pdf and /qr.png)
  const API = (api.defaults as any).baseURL as string;

  useEffect(() => {
    if (!me) return;
    setLoadingVendors(true);
    api
      .get("/my/vendors", { params: { per_page: 50, with: "none" } })
      .then((r) => {
        const arr = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
        setVendors(arr.map((v: any) => ({ id: v.id, name: v.name })));
      })
      .catch(() => setVendors([]))
      .finally(() => setLoadingVendors(false));
  }, [me?.id]);

  const hasVendors = vendors.length > 0;

  // Shared handlers
  async function handleLogout() {
    await onLogout();
    setOpen(false);
  }

  // Build vendor section
  const vendorSection = (() => {
    if (!hasVendors) {
      // Logged in but no vendors: show Become/Add Vendor
      return (
        <>
          <div className="px-3 py-2 text-xs text-base-content/60">Vendor</div>
          <Link
            to="/vendor/new"
            className="block px-3 py-2 hover:bg-base-200 text-sm"
            onClick={() => setOpen(false)}
          >
            Become a Vendor
          </Link>
        </>
      );
    }

    // Has one or more vendors
    return (
      <>
        {vendors.length > 1 && (
          <div className="px-3 py-2 text-xs text-base-content/60">My Vendors</div>
        )}

        {vendors.map((v) => (
          <div key={v.id} className="px-3 py-2">
            {/* Vendor name -> vendor detail page */}
            <Link
              to={`/vendors/${v.id}`}
              className="block font-medium hover:underline text-sm"
              onClick={() => setOpen(false)}
            >
              {v.name}
            </Link>

            <div className="mt-1 ml-3 space-y-1">
              <Link
                to={`/vendors/${v.id}/inventory`}
                className="block hover:underline text-sm"
                onClick={() => setOpen(false)}
              >
                Inventory/Fulfillment
              </Link>
              <Link
                to={`/vendors/${v.id}/products/new`}
                className="block hover:underline text-sm"
                onClick={() => setOpen(false)}
              >
                Add Product
              </Link>

              {/* QR opens Lightbox */}
              <button
                type="button"
                className="block hover:underline text-left text-sm w-full"
                onClick={() => {
                  setOpen(false);
                  setQrVendorId(v.id);
                }}
              >
                QR Code
              </button>

              {/* Flyer opens Lightbox */}
              <button
                type="button"
                className="block hover:underline text-left text-sm w-full"
                onClick={() => {
                  setOpen(false);
                  setFlyerVendorId(v.id);
                }}
              >
                Flyer
              </button>
            </div>
          </div>
        ))}

        {/* Add another vendor option */}
        <div className="px-3 py-2">
          <Link
            to="/vendor/new"
            className="block hover:underline text-sm"
            onClick={() => setOpen(false)}
          >
            Add a Vendor
          </Link>
        </div>
      </>
    );
  })();

  if (!me) {
    // Logged OUT menu
    return (
      <>
        <div className="relative" ref={menuRef}>
          <button
            className="rounded-xl border border-base-300 px-3 py-1.5 text-sm hover:bg-base-200"
            onClick={() => setOpen((v) => !v)}
          >
            Sign in
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-60 rounded-xl border border-base-300 bg-base-100 shadow-lg z-50"
            >
              <div className="px-3 py-2 text-xs text-base-content/60">Welcome</div>
              <Link
                to={`/login?next=${encodeURIComponent(next)}`}
                className="block px-3 py-2 hover:bg-base-200 text-sm"
                onClick={() => setOpen(false)}
              >
                Sign In
              </Link>
              <Link
                to={`/signup?next=${encodeURIComponent(next)}`}
                className="block px-3 py-2 hover:bg-base-200 text-sm"
                onClick={() => setOpen(false)}
              >
                Sign Up
              </Link>
              <div className="px-3 py-2 border-t border-base-300">
                <ThemeSwitcher />
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // Logged IN menu
  return (
    <>
      <div className="relative" ref={menuRef}>
       <div
        className="cursor-pointer flex items-center justify-center"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {/* Filled icon look */}
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-base-300">
          <UserCircle className="w-4 h-4 text-base-content/80" />
        </span>
      </div>

        {open && (
          <div
            className="absolute right-0 mt-2 w-[18rem] max-h-[70vh] overflow-auto rounded-xl border border-base-300 bg-base-100 shadow-lg z-[2000]"
            role="menu"
          >
            <div className="px-3 py-2 text-xs text-base-content/60">
              Signed in as
            </div>
            <div className="px-3 pb-2 text-sm font-medium">
              {me.name || me.email}
            </div>



            <div className="px-3 py-2 text-xs text-base-content/60 border-t border-base-300">
              Account
            </div>
            <Link
              to="/subscriptions"
              className="block px-3 py-2 hover:bg-base-200 text-sm"
              onClick={() => setOpen(false)}
            >
              My Subscriptions
            </Link>
            <Link
              to="/account"
              className="block px-3 py-2 hover:bg-base-200 text-sm"
              onClick={() => setOpen(false)}
            >
              Account Settings
            </Link>

            {/* Vendor section */}
            {loadingVendors ? (
              <div className="px-3 py-2 text-sm opacity-70">Loading vendors…</div>
            ) : (
              vendorSection
            )}

            <div className="px-3 py-2 border-t border-base-300">
              <ThemeSwitcher />
            </div>

            <div className="px-3 py-2 border-t border-base-300">
              <button
                className="btn btn-xs w-full"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR Lightbox (fullscreen overlay) */}
      <Lightbox open={qrVendorId !== null} onClose={() => setQrVendorId(null)}>
        {qrVendorId !== null && (
          <div className="p-3 flex flex-col items-center gap-3">
            <h3 className="text-sm font-medium">Vendor QR Code</h3>
            <img
              src={`${API}/vendors/${qrVendorId}/qr.png`}
              alt="Vendor QR code"
              className="max-h-[70vh] max-w-[90vw] object-contain border rounded"
            />
            <div className="flex gap-2">
              <a
                className="btn btn-sm"
                href={`${API}/vendors/${qrVendorId}/qr.png`}
                download
              >
                Download PNG
              </a>
              <button
                className="btn btn-sm"
                onClick={() => setQrVendorId(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Lightbox>

      {/* Flyer Lightbox (PDF in iframe) */}
      <Lightbox open={flyerVendorId !== null} onClose={() => setFlyerVendorId(null)}>
        {flyerVendorId !== null && (
          <div
            className="
              p-3 
              sm:w-[90vw] sm:max-w-4xl sm:h-[85vh]
              w-[96vw] h-[88vh]
              max-w-[96vw]
              rounded-xl
              overflow-hidden
            "
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Vendor Flyer</h3>
              <div className="flex gap-2">
                <a
                  className="btn btn-sm"
                  href={`${API}/vendors/${flyerVendorId}/flyer.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF
                </a>
                <a
                  className="btn btn-sm"
                  href={`${API}/vendors/${flyerVendorId}/flyer.pdf`}
                  download
                >
                  Download
                </a>
                <button className="btn btn-sm" onClick={() => setFlyerVendorId(null)}>
                  Close
                </button>
              </div>
            </div>
            <iframe
              title="Vendor flyer PDF"
              src={`${API}/vendors/${flyerVendorId}/flyer.pdf#toolbar=0&navpanes=0&scrollbar=1`}
              style={{ width: "100%", height: "100%", border: 0 }}
              className="rounded border"
            />
          </div>
        )}
      </Lightbox>
    </>
  );
}

/* ───────────────────────── Header ───────────────────────── */

function Header({
  me,
  onLogout,
}: {
  me: Me | null;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const [hasVendor, setHasVendor] = useState(false);
  

  // compute `next` here so Shell doesn't have to pass it
  const next = `${location.pathname}${location.search}`;

  // remember the last Browse URL
  const [browseHref, setBrowseHref] = useState("/browse");

  useEffect(() => {
    async function check() {
      if (!me) {
        setHasVendor(false);
        return;
      }
      try {
        const r = await api.get("/my/vendors", { params: { per_page: 1, with: "none" } });
        const count = Array.isArray(r.data) ? r.data.length : r.data?.data?.length ?? 0;
        setHasVendor(count > 0);
      } catch {
        setHasVendor(false);
      }
    }
    check();
  }, [me]);

  useEffect(() => {
    const u = localStorage.getItem("__last_browse_url");
    setBrowseHref(u || "/browse");
  }, [location]);

  return (
    <header className="sticky top-0 z-3000 bg-base-100 border-b border-base-300">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
        <Link
          to={browseHref}
          className="font-semibold tracking-tight text-base-content hover:text-primary"
        >
          Farmers Market Reserve
        </Link>

        <nav className="flex items-center gap-4 text-sm">


          {me && !hasVendor && (
            <Link className="text-base-content hover:text-primary" to="/vendor/new">
              
            </Link>
          )}

          {me && <NotificationsBell />}

          {/* User menu handles login/logout/links */}
          <UserMenu me={me} next={next} onLogout={onLogout} />
        </nav>
      </div>
    </header>
  );
}

/* ───────────────────────── Shell ───────────────────────── */

function Shell({
  me,
  onLogout,
  children,
}: {
  me: Me | null;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const onBrowse = location.pathname.startsWith("/browse");

  // Derive vendor status without changing the Me type
  const m = me as any;

  const hasMemberships = Array.isArray(m?.vendor_memberships) && m.vendor_memberships.length > 0;
  const hasVendors     = Array.isArray(m?.vendors)             && m.vendors.length > 0;
  const hasVendorIds   = Array.isArray(m?.vendor_ids)          && m.vendor_ids.length > 0;

  // If is_vendor is defined, use it; otherwise fall back to the array checks
  const isVendor: boolean =
    (m?.is_vendor !== undefined ? Boolean(m.is_vendor) : (hasMemberships || hasVendors || hasVendorIds));


  return (
    <div className="min-h-screen flex flex-col bg-base-100 text-base-content">
      <Header me={me} onLogout={onLogout} />

      {/* Optional hero/welcome band shown above Vendors/Products tabs */}
      {onBrowse && (
        <div className="bg-base-200/60 border-b border-base-300">
          <div className="mx-auto max-w-3xl px-4 py-5">
            {!me ? (
              /* --- Logged OUT --- */
              <div className="flex flex-row gap-4 items-start">
                <img
                  src="img/hero-welcome-1920.jpg"
                  alt="Farmers market"
                  className="w-24 h-16 md:w-44 md:h-32 object-cover rounded-xl border-0 md:border"
                />
                <div>
                  <h2 className="text-lg font-semibold">Welcome to Farmers Market Reserve</h2>
                  <p className="text-sm text-base-content/70 mt-1">
                    Pre-reserve fresh, local goods from your favorite vendors. Browse vendors and
                    products below—no account needed to look around. Create a free account to subscribe
                    for weekly pickups or one-time orders.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link className="btn btn-sm btn-primary" to="/signup?next=/browse">
                      Create account
                    </Link>
                    <Link className="btn btn-sm" to="/login?next=/browse">
                      Sign in
                    </Link>
                  </div>
                </div>
              </div>
            ) : (

            /* --- Logged IN --- */
            <div className="flex items-start gap-3 md:gap-4">
              <picture className="shrink-0">
                {/* Desktop/tablet gets the large hero; mobile gets the small logo */}
                <source srcSet="img/hero-welcome-1920.jpg" media="(min-width: 768px)" />
                <img
                  src="img/logo-hero-768.png"
                  alt="Farmers Market Reserve"
                  className="
                    w-24 h-24               /* mobile size you wanted: small logo */
                    md:w-44 md:h-32         /* desktop/tablet: taller hero block */
                    rounded-xl
                    border-0 md:border      
                    object-contain md:object-cover /* no crop on mobile; fill on desktop */
                  "
                />
              </picture>

              <div className="flex-1">
                {/* Desktop header row: title + button aligned */}
                <div className="hidden md:flex items-start justify-between gap-4">
                  <h2 className="text-lg font-semibold m-0">Welcome back!</h2>
                  {!isVendor && (
                    <Link className="btn btn-sm btn-primary" to="/vendor/new">
                      Become a Vendor
                    </Link>
                  )}
                </div>

                {/* Mobile title (button stays below the paragraph on mobile) */}
                <h2 className="md:hidden text-lg font-semibold m-0">Welcome back!</h2>

                <p className="text-sm text-base-content/70 mt-1">
                  Jump into the latest offerings below. You can also manage your subscriptions
                  and notifications from the menu.
                </p>

                {/* Mobile CTA below text */}
                {!isVendor && (
                  <div className="mt-3 md:hidden">
                    <Link className="btn btn-sm btn-primary" to="/vendor/new">
                      Become a Vendor
                    </Link>
                  </div>
                )}
              </div>
            </div>


            )}
          </div>
        </div>
      )}

      <main className="flex-1 pb-16 px-4">{children}</main>
      <footer className="bg-base-200 text-base-content text-xs text-center py-3 mt-auto">
        © {new Date().getFullYear()} Farmer’s Market Reserve
      </footer>
    </div>
  );
}

/* ───────────────────────── Auth Screens ───────────────────────── */

function LoginView({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") || "/browse";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { identity, password });
      const token = res.data.token as string;
      localStorage.setItem("token", token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      const meRes = await api.get("/me");
      onLoggedIn(meRes.data);
      navigate(next, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold mb-3">Log in</h1>

      <form onSubmit={submit} className="space-y-3">
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs">Email or mobile</span>
          </label>
          <input
            className="input input-bordered input-sm w-full"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="name@example.com or 555-123-4567"
            required
          />
        </div>

        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs">Password</span>
          </label>
          <input
            type="password"
            className="input input-bordered input-sm w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {err && <p className="text-xs text-error">{err}</p>}

        <button
          type="submit"
          className="btn btn-primary btn-sm w-full"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="text-xs mt-3">
        Don’t have an account?{" "}
        <Link className="link link-primary" to={`/signup?next=${encodeURIComponent(next)}`}>
          Sign up
        </Link>
      </div>

      <p className="text-xs opacity-60 mt-3">
        Tip: you can use your email or your mobile number.
      </p>
    </div>
  );
}

function SignupView({ onSignedUp }: { onSignedUp: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") || "/browse";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.post("/auth/signup", {
        identity,
        password,
        name: name || undefined,
      });

      const loginRes = await api.post("/auth/login", { identity, password });
      const token = loginRes.data.token as string;
      localStorage.setItem("token", token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      const meRes = await api.get("/me");
      onSignedUp(meRes.data);
      navigate(next, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold mb-3">Sign up</h1>

      <form onSubmit={submit} className="space-y-3">
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs">Name (optional)</span>
          </label>
          <input
            className="input input-bordered input-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs">Email or mobile</span>
          </label>
          <input
            className="input input-bordered input-sm w-full"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="name@example.com or 555-123-4567"
            required
          />
        </div>

        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-xs">Password</span>
          </label>
          <input
            type="password"
            className="input input-bordered input-sm w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {err && <p className="text-xs text-error">{err}</p>}

        <button
          type="submit"
          className="btn btn-primary btn-sm w-full"
          disabled={loading}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="text-xs mt-3">
        Already have an account?{" "}
        <Link className="link link-primary" to={`/login?next=${encodeURIComponent(next)}`}>
          Log in
        </Link>
      </div>
    </div>
  );
}

/* ───────────────────────── App ───────────────────────── */

export default function App() {
  const { me, loading, logout, setMe } = useAuth();
  const navigate = useNavigate(); // 👈 add this

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-base-content/70">
        Loading…
      </div>
    );
  }

  return (
    <Shell
      me={me}
      onLogout={async () => {
        await logout();
        navigate("/browse", { replace: true }); // 👈 redirect to vendor browse
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/browse" replace />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/login" element={<LoginView onLoggedIn={setMe} />} />
        <Route path="/signup" element={<SignupView onSignedUp={setMe} />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/vendors/:id" element={<VendorDetail />} />
        <Route path="/subscriptions" element={<MySubscriptions />} />
        <Route path="/account" element={<Account />} />
        <Route path="/vendor/manage" element={<VendorManage />} />
        <Route path="/vendor/new" element={<VendorNew />} />
        <Route path="/vendors/:id/products/new" element={<VendorProductNew />} />
        <Route
          path="/vendors/:vendorId/products/:productId/edit"
          element={<VendorProductEdit />}
        />
        <Route path="/vendors/:vendorId/inventory" element={<VendorInventory />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="*"
          element={
            <div className="p-6 text-sm text-base-content/70">Page not found.</div>
          }
        />
      </Routes>
    </Shell>
  );
}