// web/src/components/VendorCard.tsx
import { Link } from "react-router-dom";

export type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
  distance_miles?: number | null;
  active?: boolean;
};

type Props = {
  vendor: Vendor;
  onClick?: (v: Vendor) => void;
  favorited: boolean;  // make this required (no `?`)
  onToggleFavorite?: (vendorId: number, next: boolean) => void;
  compact?: boolean;
};

export default function VendorCard({
  vendor,
  onClick,
  favorited,
  onToggleFavorite,
  compact = false,
}: Props) {

  const next = !favorited;

  const shellCls = compact
    ? "block w-full rounded-lg p-2 bg-base-100 border border-base-300 hover:bg-base-200 transition"
    : "block w-full rounded-2xl shadow p-4 bg-base-100 hover:shadow-md transition relative";

  return (
    <Link
      to={`/vendors/${vendor.id}`}
      onClick={() => onClick?.(vendor)}
      className={shellCls}
      aria-label={vendor.name}
    >
      {/* Heart button */}
      <button
        aria-label={favorited ? "Unfavorite" : "Favorite"}
        className="absolute top-3 right-3 z-10"
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite?.(vendor.id, next);
        }}
      >
        <span
          className={`text-lg ${
            favorited ? "text-[var(--primary)]" : "text-neutral-500"
          }`}
        >
          {favorited ? "♥" : "♡"}
        </span>
      </button>

      <div className={`flex items-center gap-3 ${compact ? "" : "items-start"}`}>
        {vendor.photo_url && (
          <img
            src={vendor.photo_url}
            alt={vendor.name}
            className={
              compact
                ? "w-7 h-7 rounded-full object-cover border"
                : "w-10 h-10 rounded-full object-cover border bg-base-200"
            }
            onError={(e) =>
              ((e.currentTarget as HTMLImageElement).style.display = "none")
            }
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`truncate ${
                compact ? "text-sm font-medium" : "text-base font-semibold"
              }`}
            >
              {vendor.name}
            </h3>
            {typeof vendor.distance_miles === "number" && (
              <span className="text-xs text-base-content/70 shrink-0">
                {vendor.distance_miles.toFixed(1)} mi
              </span>
            )}
          </div>
          {!compact && vendor.contact_email && (
            <p className="text-sm text-base-content/80 mt-1 truncate">
              {vendor.contact_email}
            </p>
          )}
          {vendor.active === false && (
            <p className="text-xs mt-1 text-error">Inactive</p>
          )}
        </div>

        {compact && (
          <button
            aria-label={favorited ? "Unfavorite" : "Favorite"}
            className="shrink-0 px-1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite?.(vendor.id, next);
            }}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
          >
            <span
              className={`text-base ${
                favorited ? "text-[--color-primary]" : "text-neutral-500"
              }`}
            >
              {favorited ? "♥" : "♡"}
            </span>
          </button>
        )}
      </div>
    </Link>
  );
}