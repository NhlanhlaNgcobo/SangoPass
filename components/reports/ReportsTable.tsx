"use client";

import Badge from "@/components/ui/Badge";
import { updateReportStatus } from "@/lib/mock/reportsStore";
import type { ReportCategory, ReportEntry, ReportStatus } from "@/types";

const CATEGORY_META: Record<
  ReportCategory,
  { label: string; color: "red" | "amber" | "slate" }
> = {
  complaint: { label: "Complaint", color: "red" },
  maintenance: { label: "Maintenance", color: "amber" },
  suggestion: { label: "Suggestion", color: "slate" },
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const STATUS_COLORS: Record<ReportStatus, "amber" | "blue" | "green"> = {
  open: "amber",
  in_progress: "blue",
  resolved: "green",
};

const NEXT_STATUS: Record<ReportStatus, ReportStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "open",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReportsTable({
  reports,
  onReportsChange,
}: {
  reports: ReportEntry[];
  onReportsChange: (reports: ReportEntry[]) => void;
}) {
  function handleStatusClick(report: ReportEntry) {
    onReportsChange(updateReportStatus(report.id, NEXT_STATUS[report.status]));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Submitted By</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reports.map((report) => (
            <tr key={report.id}>
              <td className="px-4 py-3">
                <Badge color={CATEGORY_META[report.category].color}>
                  {CATEGORY_META[report.category].label}
                </Badge>
              </td>
              <td className="max-w-xs px-4 py-3 text-slate-700">
                {report.description}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {report.submittedBy}
                <span className="block text-xs capitalize text-slate-400">
                  {report.role}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {report.location ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {formatDate(report.createdAt)}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleStatusClick(report)}
                  title="Click to update status"
                >
                  <Badge color={STATUS_COLORS[report.status]}>
                    {STATUS_LABELS[report.status]}
                  </Badge>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
