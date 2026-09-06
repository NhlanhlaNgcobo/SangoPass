import { Users, ShieldCheck } from "lucide-react";
import { SAMPLE_STAFF, SAMPLE_TENANTS } from "@/lib/mock/sampleTenantsStaff";

export default function TenantsStaffPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Tenants & Staff
        </h1>
        <p className="text-sm text-slate-500">
          Everyone assigned to your properties.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — not yet connected to a real database.
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Tenants
          </h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SAMPLE_TENANTS.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {tenant.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {tenant.propertyName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {tenant.unitNumber}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Security Staff
          </h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Assigned Property</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SAMPLE_STAFF.map((staff) => (
                <tr key={staff.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {staff.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {staff.roleLabel}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {staff.assignedPropertyName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
