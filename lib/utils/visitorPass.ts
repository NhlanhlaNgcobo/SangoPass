import type { VisitorInvitation } from "@/types";

export function encodePass(invitation: VisitorInvitation) {
  return `SANGOPASS-PASS:${invitation.referenceNumber}:${invitation.secureToken}`;
}
export function findPass(payload: string, invitations: VisitorInvitation[]) {
  // Existing passes remain valid following the brand migration.
  const match = /^(?:SANGOPASS|GATEPASS)-PASS:([^:]+):([^:]+)$/.exec(
    payload.trim(),
  );
  if (!match) return null;
  return (
    invitations.find(
      (invitation) =>
        invitation.referenceNumber === match[1] &&
        invitation.secureToken === match[2],
    ) ?? null
  );
}
