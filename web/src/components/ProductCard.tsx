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
  description?: string;
  vendor?: { id: number; name: string };
  variants?: ProductVariant[];
  is_active?: boolean;
};

type Props = {
  product: Product;
  onClick?: (p: Product) => void;
};

function centsToDollars(c?: number) {
  if (typeof c !== "number") return "";
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCard({ product, onClick }: Props) {
  const cheapest = product.variants?.length
    ? [...product.variants].sort(
        (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity)
      )[0]
    : undefined;

  return (
    <Link
      to={`/products/${product.id}`}
      onClick={() => onClick?.(product)}
      className="block w-full rounded-2xl shadow p-4 bg-white hover:shadow-md transition text-left"
    >
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
        <p className="text-sm text-gray-700 mt-2 line-clamp-2">{product.description}</p>
      )}
    </Link>
  );
}