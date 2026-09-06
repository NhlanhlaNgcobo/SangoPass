import Link from "next/link";
import { Building2, DoorOpen } from "lucide-react";
import type { PropertySummary } from "@/types";

export default function PropertyCard({
  property,
}: {
  property: PropertySummary;
}) {
  const vacantCount = property.units.filter((u) => u.status === "vacant").length;

  return (
    <Link
      href={`/dashboard/manager/properties/${property.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
          <Building2 className="h-4 w-4" />
        </span>
        <h3 className="font-semibold text-slate-900">{property.name}</h3>
      </div>
      <p className="text-sm text-slate-500">{property.address}</p>
      <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
        <span>{property.units.length} units</span>
        <span className="flex items-center gap-1">
          <DoorOpen className="h-3.5 w-3.5" />
          {vacantCount} vacant
        </span>
      </div>
    </Link>
  );
}
