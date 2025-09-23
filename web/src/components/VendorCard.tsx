import { Link } from "react-router-dom";

export type Vendor = {
  id: number;
  name: string;
  contact_email?: string;
  active?: boolean;
};

type Props = {
  vendor: Vendor;
  onClick?: (v: Vendor) => void;
};

export default function VendorCard({ vendor, onClick }: Props) {
  return (
    <Link
      to={`/vendors/${vendor.id}`}
      onClick={() => onClick?.(vendor)}
      className="block w-full rounded-2xl shadow p-4 bg-white hover:shadow-md transition text-left"
    >
      <h3 className="text-base font-semibold">{vendor.name}</h3>
      {vendor.contact_email && (
        <p className="text-sm text-gray-600 mt-1">{vendor.contact_email}</p>
      )}
      {!vendor.active && (
        <p className="text-xs text-red-600 mt-1">Inactive</p>
      )}
    </Link>
  );
}