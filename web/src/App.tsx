import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
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

// Header component
function Header({ me, onLogout }: { me: Me | null; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasVendor, setHasVendor] = useState(false);

  useEffect(() => {
    async function check() {
      if (!me) { setHasVendor(false); return; }
      try {
        // Prefer the dedicated endpoint that returns only the user’s vendors
        const r = await api.get("/my/vendors", { params: { per_page: 1 } });
        // Handle either paginated or raw array responses
        const count =
          (Array.isArray(r.data) ? r.data.length : (r.data?.data?.length ?? 0));
        setHasVendor(count > 0);
      } catch {
        setHasVendor(false);
      }
    }
    check();
  }, [me]);

  async function handleLogout() { await onLogout(); navigate("/browse", { replace: true }); }

  // Preserve current path in ?next= when sending to login
  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <header className="sticky top-0 z-10 bg-white border-b">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
        <Link to="/browse" className="font-semibold tracking-tight">Farmer's Market Reserve</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link className="underline" to="/browse">Browse</Link>
          {me && !hasVendor && <Link className="underline" to="/vendor/new">Become a vendor</Link>}
          {me ? (
            <div className="flex items-center gap-3">
              <Link className="underline" to="/subscriptions">My Orders</Link>
              <Link className="underline hidden sm:inline" to="/account">Account</Link>
              <button onClick={handleLogout} className="rounded px-3 py-1 border text-xs hover:bg-gray-50">Logout</button>
            </div>
          ) : (
            <Link to={`/login?next=${next}`} className="rounded px-3 py-1 border text-xs hover:bg-gray-50">Login</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

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
    <div className="min-h-screen bg-gray-50">
      <Header me={me} onLogout={onLogout} />
      <main className="pb-16">{children}</main>
    </div>
  );
}

function LoginView({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [identity, setIdentity] = useState("admin@example.com"); // email or phone
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
      // backend supports { identity, password }
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
        <div>
          <label className="block text-xs text-gray-600 mb-1">Email or mobile</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="name@example.com or 555-123-4567"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Password</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          type="submit"
          className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* New: signup link */}
      <div className="text-xs text-gray-700 mt-3">
        Don’t have an account?{" "}
        <Link className="underline" to={`/signup?next=${encodeURIComponent(next)}`}>
          Sign up
        </Link>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Tip: you can use your email or your mobile number.
      </p>
    </div>
  );
}

// Simple signup view: name (optional), email/phone, password
function SignupView({ onSignedUp }: { onSignedUp: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState(""); // email or phone
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
      // backend route exists: /auth/signup
      // We’ll send { identity, password, name } so it can handle email or phone.
      await api.post("/auth/signup", { identity, password, name: name || undefined });

      // Auto-login right after sign-up
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
        <div>
          <label className="block text-xs text-gray-600 mb-1">Name (optional)</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Email or mobile</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="name@example.com or 555-123-4567"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Password</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          type="submit"
          className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="text-xs text-gray-700 mt-3">
        Already have an account?{" "}
        <Link className="underline" to={`/login?next=${encodeURIComponent(next)}`}>
          Log in
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const { me, loading, logout, setMe } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-gray-600">
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
        <Route path="/vendors/:vendorId/products/:productId/edit" element={<VendorProductEdit />} />
        <Route path="*" element={<div className="p-6 text-sm text-gray-600">Page not found.</div>} />
      </Routes>
    </Shell>
  );
}