"use client";
import Badge from "@/components/ui/Badge";
import { useDemoPlan } from "@/lib/mock/billingStore";
import { DEMO_ORGANIZATION } from "@/lib/mock/sampleOrganizations";
import { getPlan } from "@/lib/mock/plans";
import type { Organization } from "@/types";
export default function OrganizationPlanBadge({
  organization,
}: {
  organization: Organization;
}) {
  const plan = useDemoPlan();
  return (
    <Badge color="blue">
      {
        getPlan(
          organization.id === DEMO_ORGANIZATION.id ? plan : organization.plan,
        ).name
      }
    </Badge>
  );
}
