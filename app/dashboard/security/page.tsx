import { CalendarCheck, Users, LogOut as CheckOutIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";
import LogReportButton from "@/components/reports/LogReportButton";

export default function SecurityDashboardPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Security Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Verify and manage visitors at your assigned property.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LogReportButton role="security" />
          <Button variant="secondary">Manual Search</Button>
          <Button>Scan QR Code</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard
          title="Expected Today"
          description="Visitors invited to arrive today."
          icon={CalendarCheck}
        />
        <PlaceholderCard
          title="Currently Inside"
          description="Visitors checked in and on the property."
          icon={Users}
        />
        <PlaceholderCard
          title="Checked Out Today"
          description="Visitors who have already left today."
          icon={CheckOutIcon}
        />
      </div>
    </div>
  );
}
