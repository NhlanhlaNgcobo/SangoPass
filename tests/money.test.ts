import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { csvCell, financeCsv } from "../lib/server/finance";
import { financeExport } from "../lib/server/books";
import { store } from "../lib/server/store";
import type { LedgerRecord, UnitRecord } from "../lib/server/store";
import {
  currentPeriod,
  isPeriod,
  periodLabel,
  previousPeriod,
  randAmount,
  recentPeriods,
  summarise,
  type LedgerEntry,
} from "../lib/shared/money";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

interface Books {
  owner: Account;
  orgId: string;
  propertyId: string;
  unitId: string;
  resident: Account;
}

let counter = 0;

/** A manager with one property, one occupied unit at R5 000 a month. */
async function books(): Promise<Books> {
  counter += 1;
  const owner = await register(
    {
      email: `money-manager${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Money Estate ${counter}`,
      password: pass,
    },
    { ip: `10.11.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Money Court ${counter}`,
        address: "Pretoria",
        type: "apartment",
      })
    ).id,
  );
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: `M${counter}`,
        rent: 5000,
      })
    ).id,
  );
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: `money-tenant${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `money-tenant${counter}@example.test`,
      name: `Resident ${counter}`,
      password: pass,
    },
    { ip: `10.11.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    unitId,
    resident: (await session(accepted.token))!,
  };
}

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `e-${Math.random()}`,
  period: "2026-09",
  kind: "expense",
  category: "utilities",
  nature: "variable",
  amountCents: 100000,
  description: "Water",
  propertyId: null,
  propertyName: "",
  unitId: null,
  unitLabel: null,
  recordedBy: "Manager",
  createdAt: "2026-09-05T08:00:00.000Z",
  ...over,
});

test("the arithmetic is done in cents and adds up", async (t) => {
  await t.test("income, costs and the net between them", () => {
    const totals = summarise(
      "2026-09",
      [
        entry({ kind: "income", category: "rent", amountCents: 500000 }),
        entry({ kind: "income", category: "rent", amountCents: 450000 }),
        entry({ category: "security", nature: "fixed", amountCents: 185000 }),
        entry({ category: "staff", nature: "fixed", amountCents: 124000 }),
        entry({
          category: "utilities",
          nature: "variable",
          amountCents: 89245,
        }),
      ],
      1200000,
    );
    assert.equal(totals.rentExpectedCents, 1200000);
    assert.equal(totals.rentCollectedCents, 950000);
    assert.equal(totals.rentOutstandingCents, 250000);
    assert.equal(totals.incomeCents, 950000);
    assert.equal(totals.expensesCents, 398245);
    assert.equal(totals.fixedCents, 309000);
    assert.equal(totals.variableCents, 89245);
    assert.equal(totals.netCents, 950000 - 398245);
    // Fixed plus variable is the whole cost, with nothing falling between.
    assert.equal(
      totals.fixedCents + totals.variableCents,
      totals.expensesCents,
    );
  });

  await t.test("another month's entries are not counted", () => {
    const totals = summarise(
      "2026-09",
      [
        entry({ period: "2026-08", amountCents: 999999 }),
        entry({ period: "2026-09", amountCents: 100000 }),
      ],
      0,
    );
    assert.equal(totals.expensesCents, 100000);
  });

  await t.test("collecting more than expected never shows as negative", () => {
    // A resident settling arrears pays more than this month's rent. The books
    // must read "nothing outstanding", not "minus R2 000 outstanding".
    const totals = summarise(
      "2026-09",
      [entry({ kind: "income", category: "rent", amountCents: 700000 })],
      500000,
    );
    assert.equal(totals.rentOutstandingCents, 0);
    assert.equal(totals.rentCollectedCents, 700000);
  });

  await t.test(
    "every expense category is reported, including empty ones",
    () => {
      const totals = summarise("2026-09", [], 0);
      assert.deepEqual(
        totals.expensesByCategory.map((row) => row.category),
        ["utilities", "staff", "maintenance", "security", "other"],
      );
      // Rent is income and never appears as a cost line.
      assert.ok(
        !totals.expensesByCategory.some((row) => row.category === "rent"),
      );
      for (const row of totals.expensesByCategory)
        assert.equal(row.totalCents, 0);
    },
  );

  await t.test("months are read and written the way people say them", () => {
    assert.equal(periodLabel("2026-09"), "September 2026");
    assert.equal(previousPeriod("2026-01"), "2025-12");
    assert.equal(previousPeriod("2026-09"), "2026-08");
    assert.equal(
      recentPeriods(3, "2026-02").join(","),
      "2026-02,2026-01,2025-12",
    );
    assert.ok(isPeriod(currentPeriod()));
    for (const bad of ["2026-13", "2026-00", "2026-9", "September", ""])
      assert.equal(isPeriod(bad), false, bad);
  });

  await t.test("rands are rendered for a spreadsheet without a symbol", () => {
    assert.equal(randAmount(123456), "1234.56");
    assert.equal(randAmount(-50000), "-500.00");
    assert.equal(randAmount(0), "0.00");
  });
});

test("the spreadsheet cannot run code when it is opened", async (t) => {
  await t.test("a formula in a description is defused", () => {
    // Excel and Sheets execute a cell beginning with =, +, - or @ on open, and
    // a finance export is exactly the file worth aiming that at.
    for (const dangerous of [
      "=1+1",
      "+1",
      "-1+1",
      "@SUM(A1)",
      '=HYPERLINK("http://evil.test","click")',
    ])
      assert.ok(
        csvCell(dangerous).startsWith(`"'`),
        `${dangerous} was not defused: ${csvCell(dangerous)}`,
      );
  });

  await t.test("ordinary text is left readable", () => {
    assert.equal(csvCell("Municipal water"), '"Municipal water"');
    assert.equal(csvCell("Unit A-204"), '"Unit A-204"');
    assert.equal(csvCell(1234), '"1234"');
  });

  await t.test("a negative amount stays a number", () => {
    // Costs are written negative so a manager can sum the amount column. The
    // guard must not defuse those into text, or the sum silently drops them.
    assert.equal(csvCell("-1850.00"), '"-1850.00"');
    assert.equal(csvCell(-1850), '"-1850"');
    assert.equal(csvCell("0.00"), '"0.00"');
    // But arithmetic dressed up as an amount is still a formula.
    assert.equal(csvCell("-1+1"), `"'-1+1"`);
  });

  await t.test("quotes and newlines cannot break out of a cell", () => {
    assert.equal(csvCell('He said "yes"'), '"He said ""yes"""');
    assert.equal(csvCell("two\nlines"), '"two\nlines"');
  });
});

test("the spreadsheet reads the way a manager needs to hand it on", () => {
  const period = currentPeriod();
  const csv = financeCsv(
    "Ubuntu Living",
    period,
    [
      entry({
        period,
        kind: "income",
        category: "rent",
        amountCents: 500000,
        description: "Rent received — A-204",
        unitId: "u1",
        unitLabel: "A-204",
      }),
      entry({
        period,
        category: "security",
        nature: "fixed",
        amountCents: 185000,
        description: "Guarding contract",
      }),
    ],
    [
      {
        label: "A-204",
        propertyName: "Ubuntu Court",
        rentCents: 500000,
        paid: true,
        occupied: true,
      },
      {
        label: "B-101",
        propertyName: "Ubuntu Court",
        rentCents: 450000,
        paid: false,
        occupied: true,
      },
      // Nobody lives here, so nobody owes anything for it.
      {
        label: "C-303",
        propertyName: "Ubuntu Court",
        rentCents: 400000,
        paid: false,
        occupied: false,
      },
    ],
  );
  assert.ok(csv.startsWith("﻿"), "a BOM, so Excel reads it as UTF-8");
  assert.ok(csv.includes("Ubuntu Living"));
  assert.ok(csv.includes(periodLabel(period)));
  // Only the two let units are expected to produce rent; the empty one is
  // reported as vacancy instead of being counted as owing.
  assert.ok(csv.includes('"Rent expected (let units)","9500.00"'));
  assert.ok(csv.includes('"Vacancy (1 empty)","4000.00"'));
  assert.ok(csv.includes('"Rent collected","5000.00"'));
  assert.ok(csv.includes('"Rent outstanding","4500.00"'));
  assert.ok(csv.includes('"Net","3150.00"'));
  // The unit that has not paid is named, so the manager knows which door.
  assert.ok(csv.includes('"B-101","Ubuntu Court","4500.00"'));
  // Costs carry a minus, so summing the amount column reproduces the net.
  assert.ok(csv.includes('"-1850.00"'));
  assert.ok(
    csv.includes("\r\n"),
    "CRLF, which is what every spreadsheet expects",
  );
});

test("a closed month reports what was recorded, and claims nothing more", () => {
  const past = previousPeriod(currentPeriod());
  const csv = financeCsv(
    "Ubuntu Living",
    past,
    [
      entry({
        period: past,
        category: "staff",
        nature: "fixed",
        amountCents: 124000,
      }),
    ],
    [
      {
        label: "A-204",
        propertyName: "Ubuntu Court",
        rentCents: 500000,
        paid: false,
        occupied: true,
      },
    ],
  );
  // Today's register says nothing about a month that has closed, so arrears
  // are not invented for it.
  // The note explains why, but no figure is offered for either.
  assert.ok(!csv.includes('"Rent expected","'));
  assert.ok(!csv.includes('"Rent outstanding","'));
  assert.ok(!csv.includes("Rent outstanding by unit"));
  assert.ok(!csv.includes("A-204"));
  assert.ok(csv.includes("current month only"));
  assert.ok(csv.includes('"Total costs","1240.00"'));
});

test("the rent register writes the receipt into the books", async (t) => {
  const { owner, orgId, unitId, resident } = await books();
  const period = currentPeriod();

  await t.test("marking a unit paid records the money once", async () => {
    await command(owner, orgId, { action: "rent", unitId, paid: true });
    const state = await workspace(owner, orgId);
    const receipts = state.ledger.filter((e) => e.category === "rent");
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].amountCents, 500000);
    assert.equal(receipts[0].kind, "income");
    assert.equal(receipts[0].period, period);
    assert.equal(receipts[0].unitId, unitId);
    // And the register agrees: the flag now names the month it refers to.
    const unit = await store().get<UnitRecord>("units", unitId);
    assert.equal(unit!.rentPaid, 1);
    assert.equal(unit!.rentPaidPeriod, period);
  });

  await t.test("marking it again does not record it twice", async () => {
    await command(owner, orgId, { action: "rent", unitId, paid: true });
    const state = await workspace(owner, orgId);
    assert.equal(state.ledger.filter((e) => e.category === "rent").length, 1);
  });

  await t.test("unmarking takes the money back off the books", async () => {
    await command(owner, orgId, { action: "rent", unitId, paid: false });
    const state = await workspace(owner, orgId);
    assert.equal(state.ledger.filter((e) => e.category === "rent").length, 0);
    const unit = await store().get<UnitRecord>("units", unitId);
    assert.equal(unit!.rentPaidPeriod, "");
  });

  await t.test(
    "a receipt cannot be deleted from behind the register",
    async () => {
      await command(owner, orgId, { action: "rent", unitId, paid: true });
      const state = await workspace(owner, orgId);
      const receipt = state.ledger.find((e) => e.category === "rent")!;
      await assert.rejects(
        command(owner, orgId, { action: "ledgerRemove", id: receipt.id }),
        /rent receipt/i,
      );
    },
  );

  await t.test(
    "a stale flag from last month does not read as paid",
    async () => {
      // What the period exists to prevent: a unit marked in September must not
      // still look paid in October.
      await store().tx(async (tx) => {
        tx.update("units", unitId, { rentPaidPeriod: previousPeriod(period) });
      });
      const { csv } = await financeExport(owner, orgId, period);
      assert.ok(csv.includes("Rent outstanding by unit"));
      assert.ok(csv.includes('"5000.00"'), "the unit is counted as owing");
      await command(owner, orgId, { action: "rent", unitId, paid: true });
    },
  );

  await t.test("a resident never sees the books", async () => {
    const theirs = await workspace(resident, orgId);
    assert.deepEqual(theirs.ledger, []);
    await assert.rejects(
      command(resident, orgId, {
        action: "ledgerEntry",
        kind: "expense",
        category: "utilities",
        nature: "variable",
        amount: 100,
        description: "Sneaky",
        period,
      }),
      /manager account is required/i,
    );
    await assert.rejects(
      financeExport(resident, orgId, period),
      /manager account is required/i,
    );
  });
});

test("costs are recorded, validated and scoped to one organisation", async (t) => {
  const { owner, orgId, propertyId } = await books();
  const period = currentPeriod();

  await t.test("a cost lands in the month it belongs to", async () => {
    const created = await command(owner, orgId, {
      action: "ledgerEntry",
      kind: "expense",
      category: "security",
      nature: "fixed",
      amount: 1850,
      description: "Guarding contract",
      period,
      propertyId,
    });
    const stored = await store().get<LedgerRecord>(
      "ledger",
      String(created.id),
    );
    // Rands in, cents stored: the amount a manager typed is not the amount a
    // ledger holds.
    assert.equal(stored!.amountCents, 185000);
    assert.equal(stored!.nature, "fixed");
    assert.equal(stored!.recordedBy, owner.name);
    assert.equal(stored!.propertyName, `Money Court ${counter}`);
  });

  await t.test("rent cannot be filed as a cost", async () => {
    await assert.rejects(
      command(owner, orgId, {
        action: "ledgerEntry",
        kind: "expense",
        category: "rent",
        nature: "fixed",
        amount: 100,
        description: "Wrong way round",
        period,
      }),
      /money coming in/i,
    );
  });

  await t.test("a month that has not happened is refused", async () => {
    const [year, month] = [Number(period.slice(0, 4)), Number(period.slice(5))];
    const future =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;
    await assert.rejects(
      command(owner, orgId, {
        action: "ledgerEntry",
        kind: "expense",
        category: "utilities",
        nature: "variable",
        amount: 100,
        description: "Next month's water",
        period: future,
      }),
      /has not happened yet/i,
    );
  });

  await t.test("nothing, and nonsense, are both refused", async () => {
    for (const amount of [0, -5, "abc", 2000000])
      await assert.rejects(
        command(owner, orgId, {
          action: "ledgerEntry",
          kind: "expense",
          category: "utilities",
          nature: "variable",
          amount,
          description: "Bad amount",
          period,
        }),
        `amount ${amount} should be refused`,
      );
  });

  await t.test(
    "one organisation cannot see or remove another's books",
    async () => {
      const other = await books();
      const theirs = await command(other.owner, other.orgId, {
        action: "ledgerEntry",
        kind: "expense",
        category: "staff",
        nature: "fixed",
        amount: 900,
        description: "Their wages",
        period,
      });
      const mine = await workspace(owner, orgId);
      assert.equal(
        mine.ledger.some((e) => e.id === theirs.id),
        false,
      );
      await assert.rejects(
        command(owner, orgId, {
          action: "ledgerRemove",
          id: String(theirs.id),
        }),
        /not found/i,
      );
      // And the export carries only this organisation's money.
      const { csv } = await financeExport(owner, orgId, period);
      assert.ok(!csv.includes("Their wages"));
      assert.ok(csv.includes("Guarding contract"));
    },
  );

  await t.test("a manager can take their own entry off again", async () => {
    const created = await command(owner, orgId, {
      action: "ledgerEntry",
      kind: "expense",
      category: "other",
      nature: "variable",
      amount: 12,
      description: "Recorded by mistake",
      period,
    });
    await command(owner, orgId, {
      action: "ledgerRemove",
      id: String(created.id),
    });
    const state = await workspace(owner, orgId);
    assert.equal(
      state.ledger.some((e) => e.id === created.id),
      false,
    );
  });
});

test("an empty unit owes nothing and is never in arrears", async (t) => {
  await t.test("vacancy is reported beside the rent, not inside it", () => {
    // Two let units at R5 000, one empty at R4 000.
    const totals = summarise(
      "2026-09",
      [entry({ kind: "income", category: "rent", amountCents: 500000 })],
      1000000,
      400000,
    );
    assert.equal(totals.rentExpectedCents, 1000000);
    assert.equal(totals.rentCollectedCents, 500000);
    // The empty unit is not added to what residents owe.
    assert.equal(totals.rentOutstandingCents, 500000);
    assert.equal(totals.vacancyCents, 400000);
    assert.equal(totals.potentialRentCents, 1400000);
  });

  await t.test("with nothing empty the two figures agree", () => {
    const totals = summarise("2026-09", [], 1000000);
    assert.equal(totals.vacancyCents, 0);
    assert.equal(totals.potentialRentCents, totals.rentExpectedCents);
  });

  await t.test("the spreadsheet names the empty units", () => {
    const period = currentPeriod();
    const csv = financeCsv(
      "Ubuntu Living",
      period,
      [],
      [
        {
          label: "A-204",
          propertyName: "Ubuntu Court",
          rentCents: 500000,
          paid: true,
          occupied: true,
        },
        {
          label: "C-303",
          propertyName: "Ubuntu Court",
          rentCents: 400000,
          paid: false,
          occupied: false,
        },
      ],
    );
    assert.ok(csv.includes('"Rent expected (let units)","5000.00"'));
    assert.ok(csv.includes('"Vacancy (1 empty)","4000.00"'));
    assert.ok(csv.includes('"Rent if fully let","9000.00"'));
    assert.ok(csv.includes("Vacant unit"));
    assert.ok(csv.includes('"C-303","Ubuntu Court","4000.00"'));
    // The empty unit is not listed as owing rent.
    assert.ok(csv.includes('"Every let unit has paid"'));
  });

  await t.test(
    "a vacated unit does not carry its rent flag to the next tenant",
    async () => {
      const home = await books();
      const period = currentPeriod();
      await command(home.owner, home.orgId, {
        action: "rent",
        unitId: home.unitId,
        paid: true,
      });
      // The resident leaves after paying. The money stays on the books - it was
      // received - but the unit must not greet its next tenant as paid up.
      await command(home.owner, home.orgId, {
        action: "removeMember",
        id: home.resident.id,
      });
      const unit = await store().get<UnitRecord>("units", home.unitId);
      assert.equal(unit!.residentId, null);
      assert.equal(unit!.rentPaid, 0);
      assert.equal(unit!.rentPaidPeriod, "");

      const state = await workspace(home.owner, home.orgId);
      const receipt = state.ledger.find((e) => e.category === "rent");
      assert.ok(receipt, "the rent that was paid stays recorded");
      assert.equal(receipt.amountCents, 500000);

      // And the empty unit is reported as vacancy rather than as arrears.
      const { csv } = await financeExport(home.owner, home.orgId, period);
      assert.ok(csv.includes("Vacant unit"));
      assert.ok(csv.includes('"Every let unit has paid"'));
    },
  );
});

test("rent can only reach the books through the register", async (t) => {
  const home = await books();
  const period = currentPeriod();

  await t.test("it cannot be typed in as income", async () => {
    // Typed here it would raise "rent collected" while the arrears table,
    // which reads the register, went on saying the unit had not paid.
    await assert.rejects(
      command(home.owner, home.orgId, {
        action: "ledgerEntry",
        kind: "income",
        category: "rent",
        nature: "fixed",
        amount: 5000,
        description: "Rent, typed by hand",
        period,
      }),
      /marking the unit paid/i,
    );
  });

  await t.test("other income is still welcome", async () => {
    const created = await command(home.owner, home.orgId, {
      action: "ledgerEntry",
      kind: "income",
      category: "other",
      nature: "variable",
      amount: 350,
      description: "Parking bay let separately",
      period,
    });
    const state = await workspace(home.owner, home.orgId);
    const entry = state.ledger.find((e) => e.id === created.id)!;
    assert.equal(entry.kind, "income");
    assert.equal(entry.amountCents, 35000);
    // It counts as income without pretending to be rent.
    const totals = summarise(period, state.ledger, 500000);
    assert.equal(totals.incomeCents, 35000);
    assert.equal(totals.rentCollectedCents, 0);
    assert.equal(totals.rentOutstandingCents, 500000);
  });
});
