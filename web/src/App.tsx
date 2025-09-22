import { useEffect, useState } from "react";
import api from "./lib/api";

type Product = { id: number; name: string; unit: string; price: string | number; active: boolean };

function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("secret123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      onLoggedIn();
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold text-center mb-6">Sign in</h1>
        {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded-xl border border-gray-300 p-3 text-base focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-gray-300 p-3 text-base focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            disabled={loading}
            className="w-full rounded-xl bg-sky-600 text-white p-3 text-base font-medium active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProductsView({ onLogout }: { onLogout: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<string>("");

  const load = async () => {
    setStatus("Loading…");
    try {
      const { data } = await api.get<Product[]>("/products");
      setProducts(data);
      setStatus(`Loaded ${data.length} item${data.length === 1 ? "" : "s"}`);
    } catch {
      setStatus("Failed to load items");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Products</h1>
          <button
            onClick={onLogout}
            className="rounded-lg border px-3 py-1 text-sm active:scale-[0.98]"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-screen-sm mx-auto px-4 py-4">
        {status && <p className="text-sm text-gray-600 mb-2">{status}</p>}

        <ul className="space-y-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-gray-500">{p.unit}</div>
              </div>
              <div className="text-right">
                <div className="text-base font-semibold">
                  ${Number(p.price).toFixed(2)}
                </div>
                <button className="mt-2 rounded-xl bg-sky-600 text-white px-3 py-1.5 text-sm active:scale-[0.98]">
                  Reserve
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 text-center">
          <button
            onClick={load}
            className="rounded-xl border px-4 py-2 text-sm active:scale-[0.98]"
          >
            Refresh
          </button>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));

  const handleLoggedIn = () => setToken(localStorage.getItem("token"));
  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("token");
    setToken(null);
  };

  return token ? (
    <ProductsView onLogout={handleLogout} />
  ) : (
    <LoginView onLoggedIn={handleLoggedIn} />
  );
}