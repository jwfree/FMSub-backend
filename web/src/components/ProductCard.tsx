// web/src/components/ProductCard.tsx
import { Link } from "react-router-dom";

export type ProductVariant = {
  id: number;
  sku?: string;
  price_cents?: number;
  is_active?: boolean;
};

export type Product = {
  id: number;
  name: string;
  description?: string | null;
  vendor?: { id: number; name: string };
  variants?: ProductVariant[];
  image_url?: string | null;
  active?: boolean;            // backend uses `active`
  is_active?: boolean;         // tolerate older shape
  any_available?: number | boolean; // 0/1 or boolean
  allow_waitlist?: boolean;
  available_qty?: number | string;  // <-- accept string or number
};

type Props = {
  product: Product;
  to?: string | null;
  state?: any;
  actions?: React.ReactNode;
  showAvailability?: boolean;
  allowWaitlist?: boolean;
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCard({
  product,
  to,
  state,
  actions,
}: Props) {
  const cheapest = product.variants?.length
    ? [...product.variants].sort(
        (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity)
      )[0]
    : undefined;

  const href = to ?? `/products/${product.id}`;
  const isLink = to !== null; // null => non-link card

  const isActive = (product.active ?? product.is_active ?? true) === true;

  // any_available can be boolean or 0/1
  const isAvailable =
    typeof product.any_available === "boolean"
      ? product.any_available
      : product.any_available == null
      ? true
      : Number(product.any_available) > 0;

  // Normalize available_qty which may arrive as a string ("14")
  const availableQty =
    product.available_qty === undefined || product.available_qty === null
      ? undefined
      : Number(product.available_qty);

  const cardClass =
    "block w-full text-left rounded-2xl shadow p-4 bg-base-100 " +
    "hover:shadow-md transition focus:outline-none " +
    "focus:ring-2 focus:ring-[--color-primary]";

  const CardShell: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isLink ? (
      <Link to={href} state={state} className={cardClass} aria-label={product.name}>
        {children}
      </Link>
    ) : (
      <div className="block w-full text-left rounded-2xl shadow p-4 bg-base-100">
        {children}
      </div>
    );

  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-14 h-14 rounded object-cover border border-base-300 bg-base-200"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
              }}
            />
          )}
          <div>
            <h3 className="text-base font-semibold text-base-content">
              {product.name}
              {!isActive && (
                <span className="ml-2 text-xs rounded bg-base-200 px-1.5 py-0.5 align-middle text-base-content/80">
                  inactive
                </span>
              )}
            </h3>
            {product.vendor && (
              <div className="text-xs text-base-content/80 mt-0.5">
                {product.vendor.name}
              </div>
            )}
          </div>
        </div>

        {!!cheapest?.price_cents && (
          <div className="text-sm font-semibold shrink-0 text-[--color-primary]">
            {centsToDollars(cheapest.price_cents)}
          </div>
        )}
      </div>

      {product.description && (
        <p className="text-sm text-base-content/90 mt-2 line-clamp-2">
          {product.description}
        </p>
      )}

      {/* Availability line */}
      {isActive && (
        <>
          {isAvailable ? (
            <div className="mt-2 text-xs text-success">
              In stock
              {Number.isFinite(availableQty) && (availableQty ?? 0) > 0 && (
                <> ({availableQty})</>
              )}
            </div>
          ) : (
            <div className="mt-2 text-xs text-warning">
              Currently out of stock
              {product.allow_waitlist ? (
                <>
                  {" — "}
                  {isLink ? (
                    <span className="underline">Join waitlist</span>
                  ) : (
                    <Link
                      to={`/products/${product.id}?waitlist=1`}
                      className="underline"
                    >
                      Join waitlist
                    </Link>
                  )}
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {actions && (
        <div
          className="mt-2 flex justify-end items-center gap-2"
          onClick={
            isLink
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : undefined
          }
          onMouseDown={
            isLink
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : undefined
          }
          onKeyDown={
            isLink
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }
              : undefined
          }
        >
          {actions}
        </div>
      )}
    </CardShell>
  );
}