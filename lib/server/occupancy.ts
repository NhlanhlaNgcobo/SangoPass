/**
 * Occupancy history: who lived in a unit, and when.
 *
 * A membership answers "who is in A1 today" and is deleted the day they leave.
 * That is the right shape for access control and the wrong shape for a filing
 * cabinet - a lease outlives the stay it covers, and a deposit argument starts
 * months after the keys came back. So every stay is written down once and
 * closed rather than removed, and the document archive hangs off it.
 *
 * The reads and the writes are separate on purpose. Inside a transaction every
 * read must happen before the first write - a hard Firestore rule the SQLite
 * backend also follows - so a caller finds the tenancy among its other reads
 * and closes it among its other writes.
 */
import { randomUUID } from "node:crypto";
import { now } from "./auth";
import type { Reader, TenancyRecord, Tx } from "./store";

export interface OpenTenancy {
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  username: string | null;
}

/** Records the start of a stay. Returns the id, so a caller can file against it. */
export function openTenancy(t: Tx, input: OpenTenancy): string {
  const id = randomUUID();
  t.create("tenancies", id, {
    ...input,
    startedAt: now(),
    endedAt: null,
    endedReason: "",
    current: 1,
  });
  return id;
}

/** The stay in progress for a unit, if the register knows of one. */
export async function currentTenancy(
  reader: Reader,
  unitId: string,
): Promise<TenancyRecord | undefined> {
  return reader.first<TenancyRecord>("tenancies", {
    where: [
      ["unitId", "==", unitId],
      ["current", "==", 1],
    ],
    limit: 1,
  });
}

/**
 * Closes a stay. The row survives with everything it recorded, because the
 * documents filed against it have to still make sense afterwards - a lease
 * pointing at a tenancy that was deleted is a lease belonging to nobody.
 */
export function closeTenancy(
  t: Tx,
  tenancy: TenancyRecord,
  reason: "moved_out" | "removed" | "transferred",
) {
  t.update("tenancies", tenancy.id, {
    endedAt: now(),
    endedReason: reason,
    current: 0,
  });
}
