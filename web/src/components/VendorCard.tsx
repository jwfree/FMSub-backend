
export type Vendor = {
  id: number;
  name: string;
  active?: boolean;
  locations?: { id: number; name: string }[];
  products?: { id: number }[];
};

type Props = {
  vendor: Vendor;
  onClick?: (v: Vendor) => void;
};

export default function VendorCard({ vendor, onClick }: Props) {
  return (
    <button
      onClick={() => onClick?.(vendor)}
      className="w-full text-left rounded-2xl shadow p-4 bg-white hover:shadow-md transition"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{vendor.name}</h3>
        {vendor.active === false ? (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">inactive</span>
        ) : null}
      </div>

      <div className="mt-2 text-sm text-gray-600">
        {!!vendor.locations?.length && (
          <div className="truncate">
            📍 {vendor.locations.length} location{vendor.locations.length === 1 ? "" : "s"}
          </div>
        )}
        {!!vendor.products?.length && (
          <div className="truncate">
            🧺 {vendor.products.length} product{vendor.products.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </button>
  );
}