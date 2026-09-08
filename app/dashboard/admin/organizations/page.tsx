import OrganizationCard from "@/components/admin/OrganizationCard";
import { SAMPLE_ORGANIZATIONS } from "@/lib/mock/sampleOrganizations";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";

export default function AdminOrganizationsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Organizations</h1>
        <p className="text-sm text-slate-500">
          Every organisation using SangoPass.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
        Demo workspace · Explore with sample data.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_ORGANIZATIONS.map((organization) => (
          <OrganizationCard
            key={organization.id}
            organization={organization}
            propertyCount={
              SAMPLE_PROPERTIES.filter(
                (p) => p.organizationName === organization.name,
              ).length
            }
          />
        ))}
      </div>
    </div>
  );
}
