import { CreditCard, Building2, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PlanComparisonTable from "@/components/manager/PlanComparisonTable";
import { DEMO_ORGANIZATION } from "@/lib/mock/sampleOrganizations";
import { SAMPLE_PROPERTIES } from "@/lib/mock/sampleProperties";
import { getPlan } from "@/lib/mock/plans";

const DEMO_SEATS_USED = 1;

export default function ManagerBillingPage() {
  const plan = getPlan(DEMO_ORGANIZATION.plan);
  const unitsUsed = SAMPLE_PROPERTIES.filter(
    (property) => property.organizationName === DEMO_ORGANIZATION.name
  ).reduce((sum, property) => sum + property.units.length, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Billing &amp; Plan
        </h1>
        <p className="text-sm text-slate-500">
          {DEMO_ORGANIZATION.name}&apos;s current plan and usage.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Preview data — plan changes here don&apos;t charge anything; real
        billing isn&apos;t connected yet.
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Current Plan"
          value={plan.name}
          hint={plan.priceLabel}
          icon={CreditCard}
        />
        <StatCard
          title="Units Used"
          value={
            plan.unitCap === null
              ? `${unitsUsed}`
              : `${unitsUsed} of ${plan.unitCap}`
          }
          hint="Across your properties"
          icon={Building2}
        />
        <StatCard
          title="Property Manager Seats"
          value={
            plan.seatCap === null
              ? `${DEMO_SEATS_USED}`
              : `${DEMO_SEATS_USED} of ${plan.seatCap}`
          }
          hint="Used"
          icon={Users}
        />
      </div>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Compare Plans
      </p>
      <PlanComparisonTable currentPlan={DEMO_ORGANIZATION.plan} />
    </div>
  );
}
