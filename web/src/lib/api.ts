import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// Always attach token if present (handles hard reloads)
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config.headers as any).Authorization = `Bearer ${t}`;
  }
  return config;
});

export default api;