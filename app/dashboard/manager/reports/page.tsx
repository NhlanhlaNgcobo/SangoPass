"use client";

import { useEffect, useState } from "react";
import ReportsTable from "@/components/reports/ReportsTable";
import { getReports } from "@/lib/mock/reportsStore";
import type { ReportEntry } from "@/types";

export default function ManagerReportsPage() {
  const [reports, setReports] = useState<ReportEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of demo reports from localStorage on mount
    setReports(getReports());
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Complaints, maintenance issues, and suggestions submitted by
          tenants and staff.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — stored in this browser only, not yet connected to a
        real database.
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-slate-500">
          No reports have been submitted yet.
        </p>
      ) : (
        <ReportsTable reports={reports} onReportsChange={setReports} />
      )}
    </div>
  );
}
