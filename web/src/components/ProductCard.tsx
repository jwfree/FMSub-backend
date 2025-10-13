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
  active?: boolean;          // backend uses `active`
  is_active?: boolean;       // tolerate older shape
};

type Props = {
  product: Product;
  /** Path to link to (defaults to /products/:id). Pass null to render as a non-link card. */
  to?: string | null;
  /** React Router state to attach to the link (e.g. { from: '/browse?tab=products' }). */
  state?: any; // <-- NEW
  /** Optional actions area displayed bottom-right (e.g. edit/delete/pause buttons). */
  actions?: React.ReactNode;
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCard({ product, to, state, actions }: Props) {
  const cheapest = product.variants?.length
    ? [...product.variants].sort(
        (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity)
      )[0]
    : undefined;

  const href = to ?? `/products/${product.id}`;
  const isLink = to !== null; // null => non-link card

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
              {!(product.active ?? product.is_active ?? true) && (
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

      {actions && (
        <div
          className="mt-2 flex justify-end items-center gap-2"
          // Prevent card navigation when clicking action buttons/links
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