// web/src/lib/notifications.ts
import api from "./api";

/** A notification tied to a specific product */
export type AppNotification = {
  id: number;
  recipient_id: number;
  actor_id: number | null;
  type: string;
  title: string;
  body: string | null;
  data?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;

  // --- Formalized product linkage ---
  product_id?: number | null;      // main product reference (if known)
  product_name?: string | null;    // display name of product
  image_url?: string | null;       // thumbnail image for product
};

export type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

/**
 * Fetch paginated notifications for the logged-in user.
 * Automatically normalizes responses to Page<T> form.
 */
export async function fetchNotifications(page = 1): Promise<Page<AppNotification>> {
  const res = await api.get("/notifications", { params: { page } });
  const p = res.data;

  // If backend ever returns a plain array, normalize it
  if (Array.isArray(p)) {
    return {
      data: p,
      current_page: 1,
      last_page: 1,
      per_page: p.length,
      total: p.length,
    };
  }

  // Standard Laravel paginator format
  return {
    data: (p?.data ?? []).map((n: any) => normalizeNotification(n)),
    current_page: p?.current_page ?? 1,
    last_page: p?.last_page ?? 1,
    per_page: p?.per_page ?? (p?.data?.length ?? 0),
    total: p?.total ?? (p?.data?.length ?? 0),
  };
}

/**
 * Normalize possible backend shapes into our formal AppNotification structure.
 * Safely extracts `product_id`, `product_name`, and `image_url` from nested data.
 */
function normalizeNotification(raw: any): AppNotification {
  const product_id =
    raw.product_id ??
    raw.data?.product_id ??
    raw.data?.product?.id ??
    raw.meta?.product_id ??
    raw.meta?.product?.id ??
    null;

  const product_name =
    raw.product_name ??
    raw.data?.product_name ??
    raw.data?.product?.name ??
    raw.meta?.product_name ??
    raw.meta?.product?.name ??
    null;

  const image_url =
    raw.image_url ??
    raw.data?.image_url ??
    raw.data?.product?.image_url ??
    raw.meta?.image_url ??
    raw.meta?.product?.image_url ??
    null;

  return {
    id: raw.id,
    recipient_id: raw.recipient_id,
    actor_id: raw.actor_id,
    type: raw.type,
    title: raw.title,
    body: raw.body ?? null,
    data: raw.data ?? null,
    read_at: raw.read_at ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    product_id,
    product_name,
    image_url,
  };
}

/** Mark one notification as read */
export async function markNotificationRead(id: number) {
  await api.patch(`/notifications/${id}/read`);
}

/** Mark all notifications as read */
export async function markAllNotificationsRead() {
  await api.patch(`/notifications/read-all`);
}

/** Delete one notification */
export async function deleteNotification(id: number) {
  await api.delete(`/notifications/${id}`);
}