// web/src/pages/NotificationsPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { AppNotification } from "../lib/notifications";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../lib/notifications";
import api from "../lib/api";

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Cache of productId -> image_url
  const [productImages, setProductImages] = useState<Record<number, string>>({});

  async function load(p = page) {
    setLoading(true);
    try {
      const res = await fetchNotifications(p);
      setItems(res.data);            // array
      setLastPage(res.last_page);    // meta
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Extract a product id from a notification, in a very forgiving way
  function getProductId(n: any): number | undefined {
    const candidates = [
      n.product_id,
      n.product?.id,
      n.data?.product_id,
      n.data?.product?.id,
      n.meta?.product_id,
      n.meta?.product?.id,
      n.context?.product_id,
      n.context?.product?.id,
    ];
    for (const c of candidates) {
      const num = Number(c);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return undefined;
  }

  // Extract a product image url from a notification, if present inline
  function getInlineImageUrl(n: any): string | undefined {
    return (
      n.image_url ||
      n.product?.image_url ||
      n.data?.product?.image_url ||
      n.meta?.product?.image_url ||
      n.context?.product?.image_url ||
      undefined
    );
  }

  // After notifications load, fetch any missing product images (best-effort)
  useEffect(() => {
    const needFetch: number[] = [];
    const seen = new Set<number>();

    for (const n of items as any[]) {
      const pid = getProductId(n);
      const inlineUrl = getInlineImageUrl(n);
      // If inline url exists, record it and skip fetch
      if (inlineUrl && pid && !productImages[pid]) {
        seen.add(pid);
      } else if (pid && !productImages[pid]) {
        if (!seen.has(pid)) {
          seen.add(pid);
          needFetch.push(pid);
        }
      }
    }

    if (needFetch.length === 0 && seen.size === 0) return;

    (async () => {
      const nextMap: Record<number, string> = {};

      // 1) Persist inline urls we found (without requests)
      for (const n of items as any[]) {
        const pid = getProductId(n);
        const inlineUrl = getInlineImageUrl(n);
        if (pid && inlineUrl && !productImages[pid]) {
          nextMap[pid] = inlineUrl;
        }
      }

      // 2) Fetch the rest that didn't have inline urls
      //    (best-effort; ignore failures)
      await Promise.all(
        needFetch.map(async (pid) => {
          try {
            const r = await api.get(`/products/${pid}`, { params: { with: "none" } });
            const url = r.data?.image_url;
            if (url) nextMap[pid] = url;
          } catch {
            // ignore
          }
        })
      );

      if (Object.keys(nextMap).length > 0) {
        setProductImages((prev) => ({ ...prev, ...nextMap }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Build a quick helper for render: pick the right image per notification
  const withImages = useMemo(() => {
    return (items as any[]).map((n) => {
      const pid = getProductId(n);
      const inlineUrl = getInlineImageUrl(n);
      const cached = pid ? productImages[pid] : undefined;
      const image_url = inlineUrl || cached;
      return { n: n as AppNotification, image_url, pid };
    });
  }, [items, productImages]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-semibold mb-3">Notifications</h1>

      <div className="mb-3 flex gap-2">
        <button className="btn btn-sm" onClick={() => load(1)} disabled={loading}>
          Refresh
        </button>
        <button
          className="btn btn-sm"
          onClick={async () => {
            await markAllNotificationsRead();
            await load(page);
          }}
          disabled={loading || items.length === 0}
        >
          Mark all read
        </button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-base-content/70">No notifications.</div>
      ) : (
        <div className="space-y-2">
          {withImages.map(({ n, image_url }) => (
            <div key={n.id} className="rounded border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {image_url && (
                    <img
                      src={image_url}
                      alt=""
                      className="w-12 h-12 rounded object-cover border bg-base-200 shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div>
                    <div className="font-medium">{n.title}</div>
                    {n.body && (
                      <div className="text-sm text-base-content/70">{n.body}</div>
                    )}
                    <div className="text-[11px] text-base-content/60 mt-1">
                      {new Date(n.created_at).toLocaleString()} • {n.type}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {!n.read_at && (
                    <button
                      className="btn btn-xs"
                      onClick={async () => {
                        await markNotificationRead(n.id);
                        await load(page);
                      }}
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={async () => {
                      await deleteNotification(n.id);
                      await load(page);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simple pagination */}
      {lastPage > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <div className="text-sm">
            Page {page} / {lastPage}
          </div>
          <button
            className="btn btn-sm"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}