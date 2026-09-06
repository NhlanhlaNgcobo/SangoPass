"use client";

import { useEffect, useMemo, useState } from "react";
import VisitorStatusBadge from "@/components/visitors/VisitorStatusBadge";
import { getDisplayStatus, getInvitations } from "@/lib/mock/visitorsStore";
import type { VisitorInvitation, VisitorInvitationStatus } from "@/types";

const STATUS_FILTERS: { value: "all" | VisitorInvitationStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "checked_in", label: "Currently Inside" },
  { value: "checked_out", label: "Checked Out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ManagerVisitorsPage() {
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VisitorInvitationStatus>(
    "all"
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo visitors from localStorage on mount
    setInvitations(getInvitations());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invitations.filter((invitation) => {
      const status = getDisplayStatus(invitation);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        invitation.visitorName.toLowerCase().includes(q) ||
        invitation.referenceNumber.toLowerCase().includes(q) ||
        invitation.tenantName.toLowerCase().includes(q) ||
        invitation.propertyName.toLowerCase().includes(q)
      );
    });
  }, [invitations, query, statusFilter]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Visitors</h1>
        <p className="text-sm text-slate-500">
          Every visitor invitation across your properties.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — stored in this browser only, not yet connected to a
        real database.
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by visitor, tenant, property, or reference"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | VisitorInvitationStatus)
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">
          No visitors match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Visitor</th>
                <th className="px-4 py-3">Visiting</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {invitation.visitorName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invitation.tenantName} · {invitation.unitNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invitation.propertyName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(invitation.visitDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invitation.expectedArrival}–{invitation.expectedDeparture}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invitation.referenceNumber}
                  </td>
                  <td className="px-4 py-3">
                    <VisitorStatusBadge
                      status={getDisplayStatus(invitation)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
