import PropertyCard from "@/components/manager/PropertyCard";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";

export default function ManagerPropertiesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Properties</h1>
        <p className="text-sm text-slate-500">
          All properties under your management.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — not yet connected to a real database.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_PROPERTIES.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  );
}
