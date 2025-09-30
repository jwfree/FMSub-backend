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
export function getVendorInventory(vendorId: number, params: { date: string; location_id?: number }) {
  return api.get(`/vendors/${vendorId}/inventory`, { params });
}
export function addInventoryEntry(vendorId: number, payload: {
  vendor_location_id?: number | null;
  product_id: number;
  product_variant_id: number;
  for_date: string; // 'YYYY-MM-DD'
  qty: number;      // +add, -adjust
  entry_type: 'add' | 'adjust';
  note?: string | null;
}) {
  return api.post(`/vendors/${vendorId}/inventory/entries`, payload);
}
export function updateInventoryEntry(vendorId: number, id: number, payload: Partial<{
  qty: number;
  entry_type: 'add' | 'adjust';
  note: string | null;
}>) {
  return api.patch(`/vendors/${vendorId}/inventory/entries/${id}`, payload);
}
export function deleteInventoryEntry(vendorId: number, id: number) {
  return api.delete(`/vendors/${vendorId}/inventory/entries/${id}`);
}
export function getVendorLocations(vendorId: number) {
  // public endpoint you already have: GET /vendors/{vendor}/locations
  return api.get(`/vendors/${vendorId}/locations`);
}

export function fulfillDelivery(vendorId: number, deliveryId: number) {
  return api.patch(`/vendors/${vendorId}/inventory/deliveries/${deliveryId}/fulfill`);
}

export function markDeliveryReady(vendorId: number, deliveryId: number) {
  return api.patch(`/vendors/${vendorId}/inventory/deliveries/${deliveryId}/ready`);
}

export function cancelDelivery(vendorId: number, deliveryId: number) {
  return api.patch(`/vendors/${vendorId}/inventory/deliveries/${deliveryId}/cancel`);
}

export default api;