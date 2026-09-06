import { Building2, ShieldCheck, Activity } from "lucide-react";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";

export default function AdminDashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Super Admin Dashboard
        </h1>
        <p className="text-sm text-slate-500">
          Platform-wide overview across all organizations.
        </p>
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
