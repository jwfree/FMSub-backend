import { Link } from "react-router-dom";

export type ProductVariant = {
  id: number;
  sku?: string;
  price_cents?: number; // keep cents here
  is_active?: boolean;
};

export type Product = {
  id: number;
  name: string;
  description?: string | null;
  image_url?: string | null;           // <-- new (optional)
  vendor?: { id: number; name: string };
  variants?: ProductVariant[];
  is_active?: boolean;
};

type Props = {
  product: Product;
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCard({ product }: Props) {
  // pick the cheapest active-ish variant by price_cents
  const cheapest = product.variants?.length
    ? [...product.variants]
        .filter(v => typeof v.price_cents === "number")
        .sort(
          (a, b) => (a.price_cents ?? Number.POSITIVE_INFINITY) - (b.price_cents ?? Number.POSITIVE_INFINITY)
        )[0]
    : undefined;

  return (
    <Link
      to={`/products/${product.id}`}
      className="block w-full text-left rounded-2xl shadow p-4 bg-white hover:shadow-md transition"
    >
      <div className="flex gap-3">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-16 h-16 rounded object-cover border shrink-0"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{product.name}</h3>
              {product.vendor && (
                <div className="text-xs text-gray-600 mt-0.5">{product.vendor.name}</div>
              )}
            </div>

            {!!cheapest?.price_cents && (
              <div className="text-sm font-medium shrink-0">
                {centsToDollars(cheapest.price_cents)}
              </div>
            )}
          </div>

          {product.description && (
            <p className="text-sm text-gray-700 mt-2 line-clamp-2">
              {product.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}