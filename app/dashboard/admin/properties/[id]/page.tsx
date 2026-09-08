import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import UnitsTable from "@/components/manager/UnitsTable";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";

export default async function AdminPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = SAMPLE_PROPERTIES.find((p) => p.id === id);

  if (!property) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/dashboard/admin/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        All properties
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {property.name}
        </h1>
        <p className="text-sm text-slate-500">
          {property.address} · {property.organizationName}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
        Demo workspace · Rent and frequency changes are saved in this browser.
      </div>

      <UnitsTable units={property.units} />
    </div>
  );
}
