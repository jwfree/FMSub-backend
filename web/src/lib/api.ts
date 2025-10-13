// web/src/lib/api.ts
import axios from "axios";

/** Axios instance */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "https://fmsub.fbwks.com/api",
  withCredentials: false,
});

/** Attach bearer token when present */
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

export default api;

/* ----------------------------- Favorites API ----------------------------- */

export async function getMyFavoriteVendors(): Promise<number[]> {
  try {
    const r = await api.get<{ data: Array<{ id: number }> }>("/my/vendors/favorites");
    // API returns full vendor objects; we only need ids here
    return (r.data?.data ?? []).map((v: any) => v.id);
  } catch {
    // unauthenticated callers get empty favorites
    return [];
  }
}

export function favoriteVendor(vendorId: number) {
  return api.post(`/vendors/${vendorId}/favorite`);
}
export function unfavoriteVendor(vendorId: number) {
  return api.delete(`/vendors/${vendorId}/favorite`);
}

/* ----------------------------- Vendors/Products -------------------------- */

/** Minimal list of a vendor’s products + variants for selectors */
export function listVendorProductsMinimal(vendorId: number, params?: Record<string, any>) {
  const p = { per_page: 500, include_inactive: 1, ...params };
  return api.get(`/vendors/${vendorId}/products`, { params: p });
}

/* -------------------------------- Inventory ------------------------------ */

export function getVendorInventory(
  vendorId: number,
  params: { date: string; location_id?: number }
) {
  return api.get(`/vendors/${vendorId}/inventory`, { params });
}

export function addInventoryEntry(
  vendorId: number,
  payload: {
    product_id: number;
    product_variant_id: number;
    for_date: string;
    qty: number;
    note?: string;
    entry_type: "add" | "adjust";
    vendor_location_id?: number | null;
  }
) {
  return api.post(`/vendors/${vendorId}/inventory/entries`, payload);
}

/** Bulk add (+ preview via dry_run) */
export function addInventoryEntriesBulk(
  vendorId: number,
  payload: {
    product_id: number;
    product_variant_id: number;
    vendor_location_id?: number | null;
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
    pattern: "daily" | "every_n_days" | "weekly" | "monthly";
    every_n_days?: number;
    qty: number;
    note?: string;
    dry_run?: boolean; // 👈 allows preview without creating
  }
) {
  return api.post(`/vendors/${vendorId}/inventory/entries/bulk`, payload);
}

/** Vendor locations for filtering / choosing */
export function getVendorLocations(vendorId: number) {
  return api.get(`/vendors/${vendorId}/locations`);
}

/* -------------------------------- Deliveries ----------------------------- */

export function markDeliveryReady(vendorId: number, deliveryId: number) {
  return api.post(`/vendors/${vendorId}/deliveries/${deliveryId}/ready`);
}

export function markDeliveryFulfilled(vendorId: number, deliveryId: number) {
  return api.post(`/vendors/${vendorId}/deliveries/${deliveryId}/fulfilled`);
}

export function markDeliveryCancelled(vendorId: number, deliveryId: number) {
  return api.post(`/vendors/${vendorId}/deliveries/${deliveryId}/cancel`);
}