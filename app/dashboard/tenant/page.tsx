import { CalendarClock, Users, History } from "lucide-react";
import Button from "@/components/ui/Button";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";

export default function TenantDashboardPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome back
          </h1>
          <p className="text-sm text-slate-500">
            Here&apos;s what&apos;s happening with your visitors.
          </p>
        </div>
        <Button className="sm:w-auto">+ Invite Visitor</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard
          title="Upcoming Visitors"
          description="Visitors you've invited who haven't arrived yet."
          icon={CalendarClock}
        />
        <PlaceholderCard
          title="Active Visitors"
          description="Visitors currently checked in at your property."
          icon={Users}
        />
        <PlaceholderCard
          title="Visitor History"
          description="A record of every past visit."
          icon={History}
        />
      </div>
    </div>
  );
}
