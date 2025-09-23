import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../lib/api";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Account() {
  const q = useQuery();
  const navigate = useNavigate();
  const next = q.get("next") || "/browse";

  const [step, setStep] = useState<"identify" | "login" | "signup">("identify");
  const [identity, setIdentity] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If we're already logged in (token present), bounce to next
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate(next, { replace: true });
  }, [navigate, next]);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ exists: boolean }>("/auth/check-identity", { identity });
      setStep(data.exists ? "login" : "signup");
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Could not verify account.");
    } finally {
      setLoading(false);
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ token: string }>("/auth/login", { identity, password });
      saveTokenAndHardReload(data.token, next);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function doSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ token: string }>("/auth/signup", {
        identity,
        password,
        name: name || undefined,
      });
      saveTokenAndHardReload(data.token, next);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      {step === "identify" && (
        <>
          <h1 className="text-lg font-semibold mb-3">Sign in or create account</h1>
          <form onSubmit={identify} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email or phone</label>
              <input
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="you@example.com or 555-123-4567"
                className="w-full rounded border px-3 py-2 text-sm"
                required
              />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button
              className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
              disabled={loading || !identity.trim()}
            >
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        </>
      )}

      {step === "login" && (
        <>
          <h1 className="text-lg font-semibold mb-1">Welcome back</h1>
          <p className="text-xs text-gray-600 mb-3 break-all">{identity}</p>
          <form onSubmit={doLogin} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                autoComplete="current-password"
                required
              />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button
              className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
              disabled={loading || !password}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <button
              type="button"
              className="w-full rounded border py-2 text-sm mt-2"
              onClick={() => {
                setPassword("");
                setStep("identify");
              }}
            >
              Use a different email/phone
            </button>
          </form>
        </>
      )}

      {step === "signup" && (
        <>
          <h1 className="text-lg font-semibold mb-1">Create your account</h1>
          <p className="text-xs text-gray-600 mb-3 break-all">{identity}</p>
          <form onSubmit={doSignup} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Name (optional)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                autoComplete="new-password"
                required
              />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button
              className="w-full rounded bg-black text-white py-2 text-sm disabled:opacity-60"
              disabled={loading || !password}
            >
              {loading ? "Creating…" : "Create account"}
            </button>

            <button
              type="button"
              className="w-full rounded border py-2 text-sm mt-2"
              onClick={() => setStep("identify")}
            >
              Use a different email/phone
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function saveTokenAndHardReload(token: string, next: string) {
  localStorage.setItem("token", token);
  // ensure axios header in future requests
  // (App’s useAuth reads token on mount; easiest is to hard reload)
  window.location.replace(next || "/browse");
}