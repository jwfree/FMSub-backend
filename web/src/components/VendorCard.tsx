import { Link } from "react-router-dom";

export type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;
  photo_url?: string | null;
  active?: boolean;
};

type Props = { vendor: Vendor; onClick?: (v: Vendor) => void };

export default function VendorCard({ vendor, onClick }: Props) {
  return (
    <Link
      to={`/vendors/${vendor.id}`}
      onClick={() => onClick?.(vendor)}
      className="block w-full rounded-2xl shadow p-4 bg-base-100 hover:shadow-md transition text-left focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
      aria-label={vendor.name}
    >
      <div className="flex items-start gap-3">
        {vendor.photo_url && (
          <img
            src={vendor.photo_url}
            alt={vendor.name}
            className="w-10 h-10 rounded-full object-cover border border-base-300 bg-base-200"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        <div className="flex-1">
          <h3 className="text-base font-semibold text-base-content">
            {vendor.name}
          </h3>

          {vendor.contact_email && (
            <p className="text-sm text-base-content/80 mt-1">
              {vendor.contact_email}
            </p>
          )}

          {vendor.active === false && (
            <p className="text-xs mt-1 text-error">Inactive</p>
          )}
        </div>
      </div>
    </Link>
  );
}