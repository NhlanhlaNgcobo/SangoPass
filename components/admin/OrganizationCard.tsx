import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import OrganizationPlanBadge from "@/components/admin/OrganizationPlanBadge";
import type { Organization } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrganizationCard({
  organization,
  propertyCount,
}: {
  organization: Organization;
  propertyCount: number;
}) {
  return (
    <Link
      href={`/dashboard/admin/organizations/${organization.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h3 className="font-semibold text-slate-900">{organization.name}</h3>
        </div>
        <OrganizationPlanBadge organization={organization} />
      </div>
      <p className="text-sm text-slate-500">
        {propertyCount} propert{propertyCount === 1 ? "y" : "ies"}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Joined {formatDate(organization.createdAt)}
      </p>
    </Link>
  );
}
