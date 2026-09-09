/**
 * Validating an entry in the books, and rendering a month of them as a
 * spreadsheet.
 *
 * The arithmetic itself lives in lib/shared/money.ts so the screen and the
 * download cannot disagree about a single cent. Everything here is pure: no
 * store, no session, nothing that reads the environment - because the demo
 * runs this same validation in the browser, exactly as it runs the visit and
 * urgency rules, so the demo cannot promise a rule the server does not have.
 * Reading the books for a real manager is lib/server/books.ts.
 */
import { AppError, choice, money, text } from "./validation";
import {
  CATEGORY_LABELS,
  LEDGER_CATEGORIES,
  LEDGER_KINDS,
  LEDGER_NATURES,
  NATURE_LABELS,
  currentPeriod,
  isPeriod,
  periodLabel,
  randAmount,
  summarise,
  type LedgerCategory,
  type LedgerEntry,
} from "@/lib/shared/money";

/** How many months of books a workspace load carries. */
export const LEDGER_LIMIT = 2000;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface LedgerInput {
  period: string;
  kind: "income" | "expense";
  category: LedgerCategory;
  nature: "fixed" | "variable";
  amountCents: number;
  description: string;
}

/**
 * Validates one entry a manager is recording.
 *
 * A future month is refused: books record what has happened, and an amount
 * filed against next March is a typo every time. The past is open, because
 * catching up on last month is the ordinary case.
 */
export function parseLedgerEntry(input: Record<string, unknown>): LedgerInput {
  const period = String(input.period ?? "");
  if (!isPeriod(period)) throw new AppError("Choose a valid month.");
  if (period > currentPeriod())
    throw new AppError(
      "That month has not happened yet. Record money in the month it moved.",
    );
  const kind = choice(input.kind, LEDGER_KINDS, "entry type");
  const category = choice(input.category, LEDGER_CATEGORIES, "category");
  // Rent receipts are written by the rent register and only by it. Typed in
  // here they would raise "rent collected" while the arrears table, which
  // reads the register, went on saying the unit had not paid.
  if (category === "rent")
    throw new AppError(
      kind === "expense"
        ? "Rent is money coming in. Record a cost under utilities, staff, maintenance, security or other."
        : "Rent is recorded by marking the unit paid in Properties, so the register and the books always agree. Anything else received goes under other.",
    );
  const amountCents = money(input.amount);
  if (amountCents <= 0) throw new AppError("Enter an amount greater than R0.");
  return {
    period,
    kind,
    category,
    nature: choice(input.nature, LEDGER_NATURES, "cost type"),
    amountCents,
    description: text(input.description, "description", 200),
  };
}

/* ------------------------------------------------------------------ */
/* Spreadsheet                                                         */
/* ------------------------------------------------------------------ */

/**
 * One CSV cell.
 *
 * Quoting is the easy half. The half that matters is the leading apostrophe:
 * a cell beginning with =, +, - or @ is executed as a formula when the file is
 * opened, so a description typed as `=1+1` - or something far worse aimed at a
 * manager's machine - would run on open. Every spreadsheet program does this,
 * and a finance export is exactly the file an attacker would target, so the
 * value is prefixed and then quoted, which shows the text and runs nothing.
 */
export function csvCell(value: string | number): string {
  const raw = String(value ?? "");
  // A plain number is never a formula, and must stay a number: costs are
  // written negative so a manager can sum the amount column, and an amount
  // defused into text would silently drop out of that sum.
  const numeric = /^-?\d+(\.\d+)?$/.test(raw);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

const csvRow = (cells: (string | number)[]) => cells.map(csvCell).join(",");

/**
 * The books for one month as a spreadsheet.
 *
 * Laid out the way a manager reads it rather than the way it is stored: the
 * summary first, because that is what gets forwarded to an owner or a body
 * corporate, then the arrears, then every line that makes up the totals.
 */
export function financeCsv(
  organisationName: string,
  period: string,
  entries: LedgerEntry[],
  units: {
    label: string;
    propertyName: string;
    rentCents: number;
    paid: boolean;
    /** False when nobody lives there: no rent is owed, none is earned. */
    occupied: boolean;
  }[],
): string {
  // The rent register states how things stand now, not how they stood in a
  // closed month, so arrears are only claimed for the month in progress. An
  // earlier month reports what was actually recorded and says so, rather than
  // measuring August against today's tenants and today's rents.
  const live = period === currentPeriod();
  const let_ = units.filter((unit) => unit.occupied);
  const empty = units.filter((unit) => !unit.occupied);
  const cents = (rows: typeof units) =>
    rows.reduce((total, unit) => total + unit.rentCents, 0);
  const totals = summarise(
    period,
    entries,
    live ? cents(let_) : 0,
    live ? cents(empty) : 0,
  );
  const mine = entries
    .filter((entry) => entry.period === period)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Only a let unit can be in arrears. An empty one owes nothing.
  const arrears = let_.filter((unit) => !unit.paid);

  const lines: string[] = [
    csvRow([organisationName]),
    csvRow([`Money — ${periodLabel(period)}`]),
    csvRow([`Generated ${new Date().toISOString().slice(0, 10)}`]),
    csvRow(["All amounts in South African rand (ZAR)"]),
    ...(live
      ? []
      : [
          csvRow([
            "Rent expected and outstanding are tracked for the current month only. This month reports what was recorded.",
          ]),
        ]),
    "",
    csvRow(["Summary", "Amount"]),
    ...(live
      ? [
          csvRow([
            "Rent expected (let units)",
            randAmount(totals.rentExpectedCents),
          ]),
          csvRow(["Rent collected", randAmount(totals.rentCollectedCents)]),
          csvRow(["Rent outstanding", randAmount(totals.rentOutstandingCents)]),
          csvRow([
            `Vacancy (${empty.length} empty)`,
            randAmount(totals.vacancyCents),
          ]),
          csvRow(["Rent if fully let", randAmount(totals.potentialRentCents)]),
        ]
      : [csvRow(["Rent collected", randAmount(totals.rentCollectedCents)])]),
    csvRow([
      "Other income",
      randAmount(totals.incomeCents - totals.rentCollectedCents),
    ]),
    csvRow(["Total income", randAmount(totals.incomeCents)]),
    csvRow(["Fixed costs", randAmount(totals.fixedCents)]),
    csvRow(["Variable costs", randAmount(totals.variableCents)]),
    csvRow(["Total costs", randAmount(totals.expensesCents)]),
    csvRow(["Net", randAmount(totals.netCents)]),
    "",
    csvRow(["Costs by category", "Fixed", "Variable", "Total"]),
    ...totals.expensesByCategory.map((row) =>
      csvRow([
        CATEGORY_LABELS[row.category],
        randAmount(row.fixedCents),
        randAmount(row.variableCents),
        randAmount(row.totalCents),
      ]),
    ),
    ...(live
      ? [
          "",
          csvRow(["Rent outstanding by unit", "Property", "Monthly rent"]),
          ...(arrears.length
            ? arrears.map((unit) =>
                csvRow([
                  unit.label,
                  unit.propertyName,
                  randAmount(unit.rentCents),
                ]),
              )
            : [csvRow(["Every let unit has paid", "", ""])]),
          "",
          csvRow(["Vacant unit", "Property", "Rent not being earned"]),
          ...(empty.length
            ? empty.map((unit) =>
                csvRow([
                  unit.label,
                  unit.propertyName,
                  randAmount(unit.rentCents),
                ]),
              )
            : [csvRow(["Every unit is let", "", ""])]),
        ]
      : []),
    "",
    csvRow([
      "Date",
      "Type",
      "Category",
      "Fixed or variable",
      "Description",
      "Property",
      "Unit",
      "Recorded by",
      "Amount",
    ]),
    ...mine.map((entry) =>
      csvRow([
        entry.createdAt.slice(0, 10),
        entry.kind === "income" ? "Income" : "Cost",
        CATEGORY_LABELS[entry.category] ?? entry.category,
        NATURE_LABELS[entry.nature] ?? entry.nature,
        entry.description,
        entry.propertyName,
        entry.unitLabel ?? "",
        entry.recordedBy,
        // Costs are shown negative so a spreadsheet's own SUM over this column
        // lands on the same net figure as the summary above.
        randAmount(
          entry.kind === "expense" ? -entry.amountCents : entry.amountCents,
        ),
      ]),
    ),
  ];
  // A BOM, so Excel opens the file as UTF-8 and a resident named Müller is
  // not mangled on the way to a body corporate.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** The filename a manager sees in their downloads folder. */
export const financeFilename = (organisationName: string, period: string) =>
  `${
    organisationName
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "sangopass"
  }-money-${period}.csv`;
