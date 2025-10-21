// web/src/components/NotificationsBell.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import type { AppNotification } from "../lib/notifications";
import { fetchNotifications, markNotificationRead } from "../lib/notifications";

dayjs.extend(relativeTime);

export default function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function load() {
    setBusy(true);
    try {
      const page = await fetchNotifications(1); // paginated
      const rows = page.data ?? [];
      const sorted = rows.slice().sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.id < b.id ? 1 : -1;
      });
      setItems(sorted);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  function toggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next) load();
      return next;
    });
  }

  async function onPreviewClick(n: AppNotification) {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setItems((arr) =>
        arr.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      );
    }
  }

  const List = (
    <>
      <div className="p-2 border-b border-base-300 text-xs font-medium">
        Notifications {busy && <span className="opacity-60">• loading…</span>}
      </div>

      {items.length === 0 ? (
        <div className="p-3 text-sm text-base-content/70">No notifications yet.</div>
      ) : (
        <ul className="divide-y divide-base-200">
          {items.slice(0, 8).map((n) => (
            <li
              key={n.id}
              className={`p-3 hover:bg-base-200 cursor-pointer ${!n.read_at ? "bg-base-100" : ""}`}
              onClick={() => onPreviewClick(n)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                    n.read_at ? "bg-base-300" : "bg-primary"
                  }`}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && (
                    <div className="text-xs text-base-content/70 line-clamp-2">{n.body}</div>
                  )}
                  <div className="mt-1 text-[11px] text-base-content/50">
                    {dayjs(n.created_at).fromNow()}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="p-2 border-t border-base-300 flex justify-end">
        <button
          className="btn btn-xs"
          onClick={() => {
            setOpen(false);
            nav("/notifications");
          }}
        >
          View all
        </button>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        className="relative rounded-full p-2 hover:bg-base-200 transition"
        onClick={toggleOpen}
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg viewBox="0 0 24 24" className="w-5 h-5">
          <path
            fill="currentColor"
            d="M12 2a6 6 0 00-6 6v2.586l-.707 1.414A2 2 0 006 15h12a2 2 0 00.707-2.999L18 10.586V8a6 6 0 00-6-6zm0 20a3 3 0 002.995-2.824L15 19h-6a3 3 0 002.824 2.995L12 22z"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-4 px-1 rounded-full bg-primary text-primary-content text-[10px] flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop dropdown (>= sm) */}
      {open && (
        <div className="hidden sm:block">
          <div
            className="absolute right-0 mt-2 w-[22rem] max-h-[70vh] overflow-auto rounded-xl border border-base-300 bg-base-100 shadow-lg z-50"
            onMouseLeave={() => setOpen(false)}
          >
            {List}
          </div>
        </div>
      )}

      {/* Mobile sheet (< sm): centered, fixed, with backdrop */}
      {open && (
        <div className="sm:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed z-50 top-16 inset-x-3 rounded-2xl border border-base-300 bg-base-100 shadow-xl
                       max-h-[70vh] overflow-auto"
          >
            {List}
          </div>
        </div>
      )}
    </div>
  );
}