"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Users,
  MessageSquareWarning,
} from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import Badge from "@/components/ui/Badge";
import LogReportButton from "@/components/reports/LogReportButton";
import { SAMPLE_ORGANIZATIONS } from "@/lib/mock/sampleOrganizations";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";
import { getDisplayStatus, getInvitations } from "@/lib/mock/visitorsStore";
import { getReports } from "@/lib/mock/reportsStore";
import {
  getPlatformActivity,
  type ActivityEntry,
} from "@/lib/mock/activityFeed";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardPage() {
  const [currentlyInside, setCurrentlyInside] = useState(0);
  const [openReports, setOpenReports] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo data from localStorage on mount
    setCurrentlyInside(
      getInvitations().filter((i) => getDisplayStatus(i) === "checked_in")
        .length,
    );
    setOpenReports(getReports().filter((r) => r.status !== "resolved").length);
    setRecentActivity(getPlatformActivity().slice(0, 5));
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Your platform, in perspective.
          </h1>
          <p className="text-sm text-slate-500">
            A clear view of the organisations and communities on SangoPass.
          </p>
        </div>
        <LogReportButton role="admin" />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/admin/organizations">
          <StatCard
            title="Organizations"
            value={String(SAMPLE_ORGANIZATIONS.length)}
            icon={ShieldCheck}
          />
        </Link>
        <Link href="/dashboard/admin/properties">
          <StatCard
            title="Properties"
            value={String(SAMPLE_PROPERTIES.length)}
            icon={Building2}
          />
        </Link>
        <StatCard
          title="Currently Inside"
          value={String(currentlyInside)}
          hint="Across all properties"
          icon={Users}
        />
        <StatCard
          title="Open Reports"
          value={String(openReports)}
          hint="Complaints, maintenance, suggestions"
          icon={MessageSquareWarning}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Recent Platform Activity
        </p>
        <Link
          href="/dashboard/admin/activity"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View all activity →
        </Link>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivity.map((entry, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <Badge color={entry.type === "report" ? "amber" : "blue"}>
                    {entry.type === "report" ? "Report" : "Visitor"}
                  </Badge>
                  <span className="text-sm text-slate-700">{entry.text}</span>
                </div>
                <span className="whitespace-nowrap text-sm text-slate-400">
                  {formatTime(entry.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
