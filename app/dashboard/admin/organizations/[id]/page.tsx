import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PropertyCard from "@/components/manager/PropertyCard";
import { SAMPLE_ORGANIZATIONS } from "@/lib/mock/sampleOrganizations";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organization = SAMPLE_ORGANIZATIONS.find((o) => o.id === id);

  if (!organization) {
    notFound();
  }

  const properties = SAMPLE_PROPERTIES.filter(
    (p) => p.organizationName === organization.name
  );

  return (
    <div>
      <Link
        href="/dashboard/admin/organizations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        All organizations
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {organization.name}
        </h1>
        <p className="text-sm text-slate-500">
          {properties.length} propert{properties.length === 1 ? "y" : "ies"}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — not yet connected to a real database.
      </div>

      {properties.length === 0 ? (
        <p className="text-sm text-slate-500">
          This organization has no properties yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              hrefBase="/dashboard/admin/properties"
            />
          ))}
        </div>
      )}
    </div>
  );
}
