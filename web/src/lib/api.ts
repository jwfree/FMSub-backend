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

// ---------- Favorites helpers ----------
export async function getMyFavoriteVendors(): Promise<number[]> {
  // Accepts either [1,2,3] or [{id:1}, {id:2}] from the API
  const r = await api.get("/my/vendors/favorites");
  const d = r.data;
  if (Array.isArray(d)) {
    if (d.length === 0) return [];
    if (typeof d[0] === "number") return d as number[];
    if (typeof d[0] === "object" && d[0] && "id" in d[0]) {
      return (d as Array<{ id: number }>).map((x) => x.id);
    }
  }
  return [];
}

export function favoriteVendor(vendorId: number) {
  return api.post(`/vendors/${vendorId}/favorite`);
}

export function unfavoriteVendor(vendorId: number) {
  return api.delete(`/vendors/${vendorId}/favorite`);
}

// ---------- Variant helpers (yours) ----------
export function createVariant(
  vendorId: number,
  productId: number,
  payload: {
    sku?: string;
    name: string;
    price_cents: number;
    currency: string;
    active?: boolean;
    quantity_per_unit?: number | null;
    unit_label?: string | null;
    sort_order?: number;
  }
) {
  return api.post(`/vendors/${vendorId}/products/${productId}/variants`, payload);
}

export function updateVariant(
  variantId: number,
  payload: Partial<{
    sku: string;
    name: string;
    price_cents: number;
    currency: string;
    active: boolean;
    quantity_per_unit: number | null;
    unit_label: string | null;
    sort_order: number;
  }>
) {
  return api.patch(`/variants/${variantId}`, payload);
}

export function deleteVariant(variantId: number) {
  return api.delete(`/variants/${variantId}`);
}

export default api;