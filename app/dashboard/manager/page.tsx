import Link from "next/link";
import { Users, LogIn, LogOut, Clock, Wallet, AlertCircle } from "lucide-react";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";
import StatCard from "@/components/dashboard/StatCard";
import Button from "@/components/ui/Button";
import LogReportButton from "@/components/reports/LogReportButton";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";

function formatCurrency(amount: number): string {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export default function ManagerDashboardPage() {
  const allUnits = SAMPLE_PROPERTIES.flatMap((property) => property.units);
  const occupiedUnits = allUnits.filter((unit) => unit.status === "occupied");
  const outstandingUnits = occupiedUnits.filter((unit) => !unit.rentPaid);
  const outstandingTotal = outstandingUnits.reduce(
    (sum, unit) => sum + (unit.outstandingAmount ?? 0),
    0
  );

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

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Visitors
      </p>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlaceholderCard
          title="Total Visitors Today"
          description="Across all your properties."
          icon={Users}
        />
        <PlaceholderCard
          title="Currently Inside"
          description="Visitors on-site right now."
          icon={LogIn}
        />
        <PlaceholderCard
          title="Checked Out Today"
          description="Visitors who have left today."
          icon={LogOut}
        />
        <PlaceholderCard
          title="Pending / Upcoming"
          description="Invitations awaiting arrival."
          icon={Clock}
        />
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
