"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck } from "lucide-react";
import AddTenantModal from "@/components/manager/AddTenantModal";
import { SAMPLE_STAFF } from "@/lib/mock/sampleTenantsStaff";
import { getTenants } from "@/lib/mock/tenantsStore";
import type { TenantSummary } from "@/types";

export default function TenantsStaffPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo tenants from localStorage on mount
    setTenants(getTenants());
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Residents & staff
          </h1>
          <p className="text-sm text-slate-500">
            Everyone assigned to your properties.
          </p>
        </div>
        <AddTenantModal
          onCreated={() => {
            setTenants(getTenants());
          }}
        />
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">
        Demo workspace · Changes are saved in this browser.
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Tenants
          </h2>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Student Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((tenant) => (
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
                  <td className="px-4 py-3 text-slate-600">
                    {tenant.studentNumber ?? "—"}
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
