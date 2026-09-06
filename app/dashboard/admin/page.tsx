import { Building2, ShieldCheck, Activity } from "lucide-react";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";
import LogReportButton from "@/components/reports/LogReportButton";

export default function AdminDashboardPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Super Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Platform-wide overview across all organizations.
          </p>
        </div>
        <LogReportButton role="admin" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard
          title="Organizations"
          description="All organizations using GatePass."
          icon={ShieldCheck}
        />
        <PlaceholderCard
          title="Properties"
          description="All properties across every organization."
          icon={Building2}
        />
        <PlaceholderCard
          title="Platform Activity"
          description="High-level activity across the platform."
          icon={Activity}
        />
      </div>
    </div>
  );
}
