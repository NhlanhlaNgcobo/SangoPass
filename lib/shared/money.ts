/**
 * The property's own books: what came in, what went out, month by month.
 *
 * Separate from Billing, which is what the organisation pays SangoPass. This
 * is the manager's money - rent collected from residents, and what it costs to
 * keep the place running.
 *
 * Every amount is an integer number of cents, everywhere, for the same reason
 * every accounting system does it: a rand held as a float stops adding up
 * correctly somewhere around the third decimal, and these numbers are meant to
 * reconcile against a bank statement. Rands only ever appear at the edges -
 * what a manager types, and what the interface prints.
 *
 * Shared rather than server-only because the screen, the spreadsheet and the
 * tests must agree on the arithmetic to the cent. There is one definition of
 * every total, and it is `summarise`.
 */

export const LEDGER_KINDS = ["income", "expense"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/**
 * The five things a residential property actually spends money on, plus rent
 * coming in and a catch-all. Deliberately short: a manager choosing from a
 * list of six categories will categorise consistently, and a manager choosing
 * from forty will not.
 */
export const LEDGER_CATEGORIES = [
  "rent",
  "utilities",
  "staff",
  "maintenance",
  "security",
  "other",
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  staff: "Staff",
  maintenance: "Maintenance",
  security: "Security",
  other: "Other",
};

export const CATEGORY_HELP: Record<LedgerCategory, string> = {
  rent: "Rent received from a resident.",
  utilities: "Water, electricity, refuse, internet.",
  staff: "Wages for cleaners, gardeners, caretakers and office staff.",
  maintenance: "Repairs, contractors, parts and servicing.",
  security: "Guarding contracts, armed response, alarms and cameras.",
  other: "Rates, insurance, levies and anything that fits nowhere else.",
};

/** Categories offered when recording money going out. */
export const EXPENSE_CATEGORIES = LEDGER_CATEGORIES.filter(
  (category) => category !== "rent",
);

export const LEDGER_NATURES = ["fixed", "variable"] as const;
export type LedgerNature = (typeof LEDGER_NATURES)[number];

export const NATURE_LABELS: Record<LedgerNature, string> = {
  fixed: "Fixed",
  variable: "Variable",
};

export const NATURE_HELP: Record<LedgerNature, string> = {
  fixed: "The same every month: salaries, a security contract, insurance.",
  variable: "Changes month to month: a repair, a water bill, overtime.",
};

/** One movement of money. The client-facing shape; the stored one matches. */
export interface LedgerEntry {
  id: string;
  /** The month it belongs to, as YYYY-MM. */
  period: string;
  kind: LedgerKind;
  category: LedgerCategory;
  nature: LedgerNature;
  amountCents: number;
  description: string;
  propertyId: string | null;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
  /** Who recorded it, so a shared manager account is still accountable. */
  recordedBy: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

/**
 * This month in South Africa. The books follow the same clock as the visit
 * register, so a payment taken at 01:00 on the first is not filed against the
 * month that just ended.
 */
export const currentPeriod = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  })
    .format(new Date())
    .slice(0, 7);

export const isPeriod = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** "2026-09" as "September 2026". */
export function periodLabel(period: string): string {
  if (!isPeriod(period)) return period;
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-01T00:00:00Z`));
}

/** The month before the given one, so a manager can page backwards. */
export function previousPeriod(period: string): string {
  const [year, month] = [
    Number(period.slice(0, 4)),
    Number(period.slice(5, 7)),
  ];
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** The last `count` months, newest first, ending at `from`. */
export function recentPeriods(count = 12, from = currentPeriod()): string[] {
  const periods = [from];
  while (periods.length < count)
    periods.push(previousPeriod(periods[periods.length - 1]));
  return periods;
}

/* ------------------------------------------------------------------ */
/* Totals                                                             */
/* ------------------------------------------------------------------ */

export interface CategoryTotal {
  category: LedgerCategory;
  fixedCents: number;
  variableCents: number;
  totalCents: number;
}

export interface FinanceSummary {
  period: string;
  /** Rent the occupied units should produce this month. */
  rentExpectedCents: number;
  /**
   * Rent the empty units would produce if they were let.
   *
   * A vacant unit is not a debt and never counts as rent outstanding: nobody
   * owes it. It is income the property is not earning, which is a different
   * thing and the number an owner actually asks about, so it is reported
   * beside the rent rather than folded into it.
   */
  vacancyCents: number;
  /** Every unit let at today's rents: expected plus vacancy. */
  potentialRentCents: number;
  /** Rent actually recorded as received this month. */
  rentCollectedCents: number;
  /** Expected less collected, never below zero. */
  rentOutstandingCents: number;
  /** Everything received, including rent and any other income. */
  incomeCents: number;
  expensesCents: number;
  fixedCents: number;
  variableCents: number;
  /** Income less expenses. Negative means the month cost more than it made. */
  netCents: number;
  /** Every expense category, in the order a manager reads them. */
  expensesByCategory: CategoryTotal[];
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

/**
 * Every figure the money screen and the spreadsheet show, from the entries of
 * one month plus what the rent register expects.
 *
 * The two rent figures are passed in rather than derived here because they
 * come from the units register, which is a statement of how things stand now -
 * not a record of how they stood in a past month. See the note on the screen.
 */
export function summarise(
  period: string,
  entries: LedgerEntry[],
  expectedRentCents: number,
  vacantRentCents = 0,
): FinanceSummary {
  const mine = entries.filter((entry) => entry.period === period);
  const income = mine.filter((entry) => entry.kind === "income");
  const expenses = mine.filter((entry) => entry.kind === "expense");
  const rentCollectedCents = sum(
    income.filter((e) => e.category === "rent").map((e) => e.amountCents),
  );
  const incomeCents = sum(income.map((e) => e.amountCents));
  const expensesCents = sum(expenses.map((e) => e.amountCents));
  const of = (nature: LedgerNature) =>
    sum(expenses.filter((e) => e.nature === nature).map((e) => e.amountCents));

  return {
    period,
    rentExpectedCents: expectedRentCents,
    vacancyCents: vacantRentCents,
    potentialRentCents: expectedRentCents + vacantRentCents,
    rentCollectedCents,
    rentOutstandingCents: Math.max(0, expectedRentCents - rentCollectedCents),
    incomeCents,
    expensesCents,
    fixedCents: of("fixed"),
    variableCents: of("variable"),
    netCents: incomeCents - expensesCents,
    expensesByCategory: EXPENSE_CATEGORIES.map((category) => {
      const rows = expenses.filter((e) => e.category === category);
      const fixedCents = sum(
        rows.filter((e) => e.nature === "fixed").map((e) => e.amountCents),
      );
      const variableCents = sum(
        rows.filter((e) => e.nature === "variable").map((e) => e.amountCents),
      );
      return {
        category,
        fixedCents,
        variableCents,
        totalCents: fixedCents + variableCents,
      };
    }),
  };
}

/** Rands, for display. Cents are the truth; this is the presentation. */
export function rands(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** The plain number a spreadsheet should receive: 145000 cents as 1450.00. */
export function randAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
