"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, LogIn, LogOut, Clock, Wallet, AlertCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import Button from "@/components/ui/Button";
import LogReportButton from "@/components/reports/LogReportButton";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";
import { getInvitations, getDisplayStatus } from "@/lib/mock/visitorsStore";
import type { VisitorInvitation } from "@/types";

function formatCurrency(amount: number): string {
  return `R${amount.toLocaleString("en-ZA")}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function activityLine(invitation: VisitorInvitation): {
  time: string;
  text: string;
} {
  if (invitation.checkedOutAt) {
    return {
      time: invitation.checkedOutAt,
      text: `${invitation.visitorName} checked out`,
    };
  }
  if (invitation.checkedInAt) {
    return {
      time: invitation.checkedInAt,
      text: `${invitation.visitorName} checked in`,
    };
  }
  return {
    time: invitation.createdAt,
    text:
      invitation.status === "cancelled"
        ? `${invitation.visitorName}'s invitation was cancelled`
        : `${invitation.visitorName} was invited`,
  };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ManagerDashboardPage() {
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo visitors from localStorage on mount
    setInvitations(getInvitations());
  }, []);

  const allUnits = SAMPLE_PROPERTIES.flatMap((property) => property.units);
  const occupiedUnits = allUnits.filter((unit) => unit.status === "occupied");
  const outstandingUnits = occupiedUnits.filter((unit) => !unit.rentPaid);
  const outstandingTotal = outstandingUnits.reduce(
    (sum, unit) => sum + (unit.outstandingAmount ?? 0),
    0
  );

  const today = todayStr();
  const totalToday = invitations.filter((i) => i.visitDate === today).length;
  const currentlyInside = invitations.filter(
    (i) => getDisplayStatus(i) === "checked_in"
  ).length;
  const checkedOutToday = invitations.filter(
    (i) =>
      i.status === "checked_out" && i.checkedOutAt?.slice(0, 10) === today
  ).length;
  const pendingUpcoming = invitations.filter(
    (i) => getDisplayStatus(i) === "upcoming"
  ).length;

  const recentActivity = [...invitations]
    .map(activityLine)
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .slice(0, 5);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Property Manager Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            An overview of visitor activity and rent across your properties.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LogReportButton role="manager" />
          <Link href="/dashboard/manager/properties">
            <Button variant="secondary">View Properties</Button>
          </Link>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Visitors
        </p>
        <Link
          href="/dashboard/manager/visitors"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View all visitors →
        </Link>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Visitors Today"
          value={String(totalToday)}
          icon={Users}
        />
        <StatCard
          title="Currently Inside"
          value={String(currentlyInside)}
          icon={LogIn}
        />
        <StatCard
          title="Checked Out Today"
          value={String(checkedOutToday)}
          icon={LogOut}
        />
        <StatCard
          title="Pending / Upcoming"
          value={String(pendingUpcoming)}
          icon={Clock}
        />
      </div>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Recent Activity
      </p>
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">No visitor activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {recentActivity.map((entry, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-slate-700">{entry.text}</span>
                <span className="text-slate-400">
                  {formatTime(entry.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Rent (preview data)
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Rent Paid Up To Date"
          value={`${occupiedUnits.length - outstandingUnits.length} of ${occupiedUnits.length} tenants`}
          hint="Based on sample property data"
          icon={Wallet}
        />
        <StatCard
          title="Rent Outstanding"
          value={formatCurrency(outstandingTotal)}
          hint={`${outstandingUnits.length} tenant${outstandingUnits.length === 1 ? "" : "s"} behind on payment`}
          icon={AlertCircle}
        />
      </div>
    </div>
  );
}
