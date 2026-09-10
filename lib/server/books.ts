/**
 * Reading an organisation's books for export.
 *
 * Separate from finance.ts, which holds the validation and the spreadsheet
 * itself, because the demo runs that code in the browser. Anything that
 * touches the store or the membership check has to stay on this side of the
 * line, or the storage backend ends up in the client bundle - which is exactly
 * what happened the first time these lived together.
 */
import { access } from "./workspace";
import { store } from "./store";
import type { LedgerRecord, UnitRecord } from "./store";
import { financeCsv, financeFilename, LEDGER_LIMIT } from "./finance";
import { AppError } from "./validation";
import { currentPeriod, isPeriod, type LedgerEntry } from "@/lib/shared/money";
import type { Account } from "@/types/workspace";

/**
 * One month of the organisation's books, as a spreadsheet.
 *
 * Managers only: this is the organisation's money, and neither a resident nor
 * a guard has any business reading it.
 */
export async function financeExport(
  user: Account,
  orgId: string,
  requested?: string | null,
) {
  const membership = await access(user, orgId);
  if (membership.role !== "manager")
    throw new AppError("A manager account is required.", 403);
  const period = isPeriod(requested) ? requested : currentPeriod();

  const database = store();
  const [organisation, entries, units, properties] = await Promise.all([
    database.get<{ name: string }>("organisations", orgId),
    database.find<LedgerRecord>("ledger", {
      where: [
        ["orgId", "==", orgId],
        ["period", "==", period],
      ],
      limit: LEDGER_LIMIT,
    }),
    database.find<UnitRecord>("units", { where: [["orgId", "==", orgId]] }),
    database.find<{ id: string; name: string }>("properties", {
      where: [["orgId", "==", orgId]],
    }),
  ]);

  // Every unit, let or empty. A vacant one owes nothing and is never in
  // arrears, but the rent it is not earning is exactly what an owner asks
  // about, so it is carried through and reported separately.
  const register = units
    // An archived unit is out of use: it earns nothing, owes nothing, and is
    // not vacancy either. It stays in the ledger's history, not in this month.
    .filter((unit) => !unit.archivedAt)
    .map((unit) => ({
      label: unit.label,
      propertyName:
        properties.find((p) => p.id === unit.propertyId)?.name ?? "",
      rentCents: unit.rentCents,
      occupied: (unit.occupants ?? 0) > 0,
      // Only for the month being exported: a September flag says nothing
      // about October.
      paid: Boolean(unit.rentPaid) && unit.rentPaidPeriod === period,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    period,
    filename: financeFilename(organisation?.name ?? "sangopass", period),
    csv: financeCsv(
      organisation?.name ?? "SangoPass",
      period,
      entries as unknown as LedgerEntry[],
      register,
    ),
  };
}
