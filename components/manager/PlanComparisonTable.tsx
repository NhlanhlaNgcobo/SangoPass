import Badge from "@/components/ui/Badge";
import UpgradePlanButton from "@/components/manager/UpgradePlanButton";
import { PLANS } from "@/lib/mock/plans";
import type { PlanTier } from "@/types";

function capLabel(cap: number | null, unit: string): string {
  return cap === null ? `Unlimited ${unit}` : `Up to ${cap} ${unit}`;
}

export default function PlanComparisonTable({
  currentPlan,
}: {
  currentPlan: PlanTier;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">&nbsp;</th>
            {PLANS.map((plan) => (
              <th key={plan.id} className="px-4 py-3">
                <div className="flex items-center gap-2 normal-case tracking-normal text-slate-900">
                  <span className="font-semibold">{plan.name}</span>
                  {plan.id === currentPlan && (
                    <Badge color="blue">Current</Badge>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="px-4 py-3 text-slate-500">Price</td>
            {PLANS.map((plan) => (
              <td
                key={plan.id}
                className="px-4 py-3 font-semibold text-slate-900"
              >
                {plan.priceLabel}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3 text-slate-500">Units included</td>
            {PLANS.map((plan) => (
              <td key={plan.id} className="px-4 py-3 text-slate-600">
                {capLabel(plan.unitCap, "units")}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3 text-slate-500">Property manager seats</td>
            {PLANS.map((plan) => (
              <td key={plan.id} className="px-4 py-3 text-slate-600">
                {capLabel(plan.seatCap, "seats")}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3 text-slate-500">
              Rent &amp; maintenance tracking
            </td>
            {PLANS.map((plan) => (
              <td key={plan.id} className="px-4 py-3 text-green-700">
                Included
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3 text-slate-500">Support</td>
            {PLANS.map((plan) => (
              <td key={plan.id} className="px-4 py-3 text-slate-600">
                {plan.support}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3"></td>
            {PLANS.map((plan) => (
              <td key={plan.id} className="px-4 py-3">
                {plan.id === currentPlan ? (
                  <span className="text-sm text-slate-400">Your plan</span>
                ) : (
                  <UpgradePlanButton
                    planName={plan.name}
                    isContactSales={plan.id === "portfolio"}
                  />
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
