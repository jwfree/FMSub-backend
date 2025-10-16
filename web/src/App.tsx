import { useEffect, useState } from "react";
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

/* ───────────────────────── Header ───────────────────────── */

function Header({
  me,
  onLogout,
}: {
  me: Me | null;
  onLogout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasVendor, setHasVendor] = useState(false);

  // NEW: remember the last Browse URL
  const [browseHref, setBrowseHref] = useState("/browse");

  // 🧩 Effect 1: check vendor access (your existing one, unchanged)
  useEffect(() => {
    async function check() {
      if (!me) {
        setHasVendor(false);
        return;
      }
      try {
        const r = await api.get("/my/vendors", { params: { per_page: 1 } });
        const count = Array.isArray(r.data)
          ? r.data.length
          : r.data?.data?.length ?? 0;
        setHasVendor(count > 0);
      } catch {
        setHasVendor(false);
      }
    }
    check();
  }, [me]);

  // 🧩 Effect 2: keep `browseHref` synced with localStorage
  useEffect(() => {
    const u = localStorage.getItem("__last_browse_url");
    setBrowseHref(u || "/browse");
  }, [location]);

  async function handleLogout() {
    await onLogout();
    const u = localStorage.getItem("__last_browse_url") || "/browse";
    navigate(u, { replace: true });
  }

  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <header className="sticky top-0 z-10 bg-base-100 border-b border-base-300">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
        {/* use browseHref for logo */}
        <Link
          to={browseHref}
          className="font-semibold tracking-tight text-base-content hover:text-primary"
        >
          Farmers Market Reserve
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {/* use browseHref for Browse link */}
          <Link className="text-base-content hover:text-primary" to={browseHref}>
            Browse
          </Link>

          {me && !hasVendor && (
            <Link className="text-base-content hover:text-primary" to="/vendor/new">
              Become a vendor
            </Link>
          )}

          <ThemeSwitcher />

          {me ? (
            <div className="flex items-center gap-3">
              <Link className="text-base-content hover:text-primary" to="/subscriptions">
                My Orders
              </Link>
              <Link
                className="text-base-content hover:text-primary hidden sm:inline"
                to="/account"
              >
                Account
              </Link>
              <button onClick={handleLogout} className="btn btn-xs sm:btn-sm btn-outline">
                Logout
              </button>
            </div>
          ) : (
            <Link
              to={`/login?next=${next}`}
              className="btn btn-xs sm:btn-sm btn-outline"
            >
              Login
            </Link>
          )}
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
  return (
    <div className="min-h-screen flex flex-col bg-base-100 text-base-content">
      <Header me={me} onLogout={onLogout} />
      <main className="flex-1 pb-16 px-4">{children}</main>
      <footer className="bg-base-200 text-base-content text-xs text-center py-3 mt-auto">
        © {new Date().getFullYear()} Farmer’s Market Reserve
      </footer>
    </div>
  );
}

/* ───────────────────────── Auth Screens ───────────────────────── */

function LoginView({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [identity, setIdentity] = useState("admin@example.com");
  const [password, setPassword] = useState("secret123");
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
        <Route
          path="*"
          element={
            <div className="p-6 text-sm text-base-content/70">Page not found.</div>
          }
        />
        <Route path="/vendors/:vendorId/inventory" element={<VendorInventory />} />
      </Routes>
    </Shell>
  );
}