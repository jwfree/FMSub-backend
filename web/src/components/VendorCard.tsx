import { Link } from "react-router-dom";

export type Vendor = {
  id: number;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  banner_url?: string | null;   // ✅ use URL
  photo_url?: string | null;    // ✅ use URL
  active?: boolean;
};

type Props = { vendor: Vendor; onClick?: (v: Vendor) => void };

export default function VendorCard({ vendor, onClick }: Props) {
  return (
    <Link
      to={`/vendors/${vendor.id}`}
      onClick={() => onClick?.(vendor)}
      className="block w-full rounded-2xl shadow p-4 bg-white hover:shadow-md transition text-left"
    >
      <div className="flex items-start gap-3">
        {vendor.photo_url && (
          <img
            src={vendor.photo_url}
            alt=""
            className="w-10 h-10 rounded-full object-cover border"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <div className="flex-1">
          <h3 className="text-base font-semibold">{vendor.name}</h3>
          {vendor.contact_email && (
            <p className="text-sm text-gray-600 mt-1">{vendor.contact_email}</p>
          )}
          {!vendor.active && <p className="text-xs text-red-600 mt-1">Inactive</p>}
        </div>
      </div>
    </Link>
  );
}