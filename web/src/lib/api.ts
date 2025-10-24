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
  const token = localStorage.getItem("token");
  if (!token) {
    // 👇 Skip the network call entirely if user not logged in
    return [];
  }

  try {
    // ✅ Server returns an array, not { data: [...] }
    const r = await api.get<Array<{ id: number }>>("/my/vendors/favorites");
    return (r.data ?? []).map((v: any) => v.id);
  } catch (err) {
    console.warn("getMyFavoriteVendors error:", err);
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

type InventoryEntryPayload = {
  product_id: number;
  product_variant_id: number;
  for_date: string; // YYYY-MM-DD
  qty: number;
  note?: string;
  entry_type: "add" | "adjust";
  vendor_location_id?: number | null;
  /** NEW: how many days this entry is valid for; null/undefined means never expires */
  shelf_life_days?: number | null;
};

export function getVendorInventory(
  vendorId: number,
  params: { date: string; location_id?: number }
) {
  return api.get(`/vendors/${vendorId}/inventory`, { params });
}

export function addInventoryEntry(vendorId: number, payload: InventoryEntryPayload) {
  return api.post(`/vendors/${vendorId}/inventory/entries`, payload);
}

/** Bulk add (+ preview via dry_run) */
// Back-compat: accept either the new shape ({ pattern: { kind, n? }, entry_type })
// or the old one (pattern as string + every_n_days). We normalize before POST.
type BulkInventoryPayloadNew = {
  product_id: number;
  product_variant_id: number;
  vendor_location_id?: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  qty: number;
  entry_type: "add" | "adjust";
  note?: string;
  pattern: { kind: "daily" | "every_n_days" | "weekly" | "monthly"; n?: number };
  dry_run?: boolean;
  shelf_life_days?: number | null; // NEW
};

// legacy shape you previously had in this file
type BulkInventoryPayloadLegacy = {
  product_id: number;
  product_variant_id: number;
  vendor_location_id?: number | null;
  start_date: string;
  end_date: string;
  pattern: "daily" | "every_n_days" | "weekly" | "monthly";
  every_n_days?: number;
  qty: number;
  note?: string;
  dry_run?: boolean;
  // (no entry_type in legacy; if omitted we’ll default to "add")
  entry_type?: "add" | "adjust";
  shelf_life_days?: number | null;
};

export function addInventoryEntriesBulk(
  vendorId: number,
  payload: BulkInventoryPayloadNew | BulkInventoryPayloadLegacy
) {
  // Normalize to the controller’s new expected payload
  const normalized: BulkInventoryPayloadNew = "pattern" in payload && typeof (payload as any).pattern === "object"
    ? (payload as BulkInventoryPayloadNew)
    : {
        product_id: payload.product_id,
        product_variant_id: payload.product_variant_id,
        vendor_location_id: payload.vendor_location_id ?? null,
        start_date: payload.start_date,
        end_date: payload.end_date,
        qty: payload.qty,
        note: payload.note,
        dry_run: payload.dry_run,
        entry_type: (payload as any).entry_type ?? "add",
        shelf_life_days: payload.shelf_life_days ?? null,
        pattern: {
          kind: (payload as BulkInventoryPayloadLegacy).pattern,
          n:
            (payload as BulkInventoryPayloadLegacy).pattern === "every_n_days"
              ? (payload as BulkInventoryPayloadLegacy).every_n_days ?? 2
              : undefined,
        },
      };

  return api.post(`/vendors/${vendorId}/inventory/entries/bulk`, normalized);
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

export type UserAddress = {
  id: number;
  label?: string | null;
  recipient_name?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
  instructions?: string | null;
};

export function listMyAddresses() {
  return api.get<UserAddress[]>('/me/addresses');
}
export function createMyAddress(payload: Partial<UserAddress>) {
  return api.post<UserAddress>('/me/addresses', payload);
}
export function updateMyAddress(id: number, payload: Partial<UserAddress>) {
  return api.patch<UserAddress>(`/me/addresses/${id}`, payload);
}
export function deleteMyAddress(id: number) {
  return api.delete(`/me/addresses/${id}`);
}
export function makeDefaultAddress(id: number) {
  return api.post<UserAddress>(`/me/addresses/${id}/default`, {});
}

export function changeMyPassword(payload: {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}) {
  return api.post('/account/change-password', payload);
}

// ---------- Stripe (vendor-scoped) ----------
export async function createStripeConnectLink(vendorId: number): Promise<string> {
  const r = await api.post<{ url: string }>(`/vendors/${vendorId}/stripe/connect-link`);
  return r.data.url;
}

export async function createStripeLoginLink(vendorId: number): Promise<string> {
  const r = await api.post<{ url: string }>(`/vendors/${vendorId}/stripe/login-link`);
  return r.data.url;
}