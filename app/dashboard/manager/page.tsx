import { Users, LogIn, LogOut, Clock } from "lucide-react";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";

export default function ManagerDashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Property Manager Dashboard
        </h1>
        <p className="text-sm text-slate-500">
          An overview of visitor activity across your properties.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}
