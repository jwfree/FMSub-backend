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

export function createVariant(vendorId: number, productId: number, payload: {
  sku?: string;
  name: string;
  price_cents: number;
  currency: string;
  active?: boolean;
  quantity_per_unit?: number | null;
  unit_label?: string | null;
  sort_order?: number;
}) {
  return api.post(`/vendors/${vendorId}/products/${productId}/variants`, payload);
}

export function updateVariant(variantId: number, payload: Partial<{
  sku: string;
  name: string;
  price_cents: number;
  currency: string;
  active: boolean;
  quantity_per_unit: number | null;
  unit_label: string | null;
  sort_order: number;
}>) {
  return api.patch(`/variants/${variantId}`, payload);
}

export function deleteVariant(variantId: number) {
  return api.delete(`/variants/${variantId}`);
}

export default api;