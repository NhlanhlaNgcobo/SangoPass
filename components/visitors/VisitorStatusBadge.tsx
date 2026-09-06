import Badge from "@/components/ui/Badge";
import type { VisitorInvitationStatus } from "@/types";

const STATUS_META: Record<
  VisitorInvitationStatus,
  { label: string; color: "green" | "amber" | "red" | "slate" | "blue" }
> = {
  upcoming: { label: "Upcoming", color: "blue" },
  checked_in: { label: "Currently Inside", color: "green" },
  checked_out: { label: "Checked Out", color: "slate" },
  cancelled: { label: "Cancelled", color: "red" },
  expired: { label: "Expired", color: "amber" },
};

export default function VisitorStatusBadge({
  status,
}: {
  status: VisitorInvitationStatus;
}) {
  const meta = STATUS_META[status];
  return <Badge color={meta.color}>{meta.label}</Badge>;
}
