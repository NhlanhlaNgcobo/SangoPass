import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { importResidents, MAX_IMPORT_ROWS } from "../lib/server/enrolment";
import { store } from "../lib/server/store";
import type { InvitationRecord, PropertyRecord } from "../lib/server/store";
import { csvDocument, importTemplate, parseCsv } from "../lib/shared/csv";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

interface Estate {
  owner: Account;
  orgId: string;
  propertyId: string;
  property: PropertyRecord;
  /** A1..A6, all vacant. */
  units: string[];
}

let counter = 0;

async function estate(
  type: "apartment" | "student_accommodation" = "apartment",
): Promise<Estate> {
  counter += 1;
  const owner = await register(
    {
      email: `import${counter}-owner@example.test`,
      name: "Nomsa Manager",
      organisation: `Import Estate ${counter}`,
      password: pass,
    },
    { ip: `10.31.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Import Court ${counter}`,
        address: "Pretoria",
        type,
      })
    ).id,
  );
  const units: string[] = [];
  for (let n = 1; n <= 6; n += 1) {
    const label = `A${n}`;
    await command(owner.user, owner.orgId, {
      action: "unit",
      propertyId,
      label,
      rent: 5000,
    });
    units.push(label);
  }
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    property: (await store().get<PropertyRecord>("properties", propertyId))!,
    units,
  };
}

const roll = (rows: string[][], student = false) =>
  csvDocument([
    student ? ["Email", "Unit", "Student number"] : ["Email", "Unit"],
    ...rows,
  ]);

/** Every pending invitation at this organisation, by email. */
const pending = async (orgId: string) =>
  (
    await store().find<InvitationRecord>("invitations", {
      where: [["orgId", "==", orgId]],
    })
  ).map((i) => i.email);

/* ------------------------------------------------------------------ */
/* The reader                                                          */
/* ------------------------------------------------------------------ */

test("the CSV reader handles what a spreadsheet actually writes", async (t) => {
  await t.test("quoted commas stay inside one field", () => {
    assert.deepEqual(parseCsv('a,"b,c",d'), [["a", "b,c", "d"]]);
  });

  await t.test("a doubled quote is one literal quote", () => {
    assert.deepEqual(parseCsv('"she said ""hi""",2'), [['she said "hi"', "2"]]);
  });

  await t.test("a quoted field may contain a newline", () => {
    assert.deepEqual(parseCsv('"line one\nline two",x'), [
      ["line one\nline two", "x"],
    ]);
  });

  await t.test("CRLF is one ending, not two rows", () => {
    assert.deepEqual(parseCsv("a,b\r\nc,d\r\n"), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  await t.test(
    "Excel's byte-order mark does not become part of a heading",
    () => {
      assert.deepEqual(parseCsv("﻿Email,Unit\r\na@b.test,A1"), [
        ["Email", "Unit"],
        ["a@b.test", "A1"],
      ]);
    },
  );

  await t.test("trailing blank rows are dropped", () => {
    assert.deepEqual(parseCsv("a,b\n\n\n"), [["a", "b"]]);
  });

  await t.test("a value that looks like a formula cannot execute", () => {
    // The same rule the money spreadsheet applies on the way out.
    assert.match(importTemplate(false, ["=cmd|'/c calc'!A1"]), /'=cmd/);
  });
});

/* ------------------------------------------------------------------ */
/* A file that works                                                   */
/* ------------------------------------------------------------------ */

test("a good roll enrols every row at once", async (t) => {
  const e = await estate();
  const outcome = await importResidents(
    e.orgId,
    e.property,
    roll([
      ["  Ayanda@Example.test  ", "A1"],
      ["sipho@example.test", "A2"],
      ["fatima@example.test", "a3"],
    ]),
  );
  assert.equal(outcome.ok, true);

  await t.test("one invitation per row", () => {
    assert.ok(outcome.ok && outcome.invitations.length === 3);
  });

  await t.test("addresses are trimmed and lower-cased", async () => {
    const emails = await pending(e.orgId);
    assert.ok(emails.includes("ayanda@example.test"));
  });

  await t.test("the unit is matched however it was capitalised", async () => {
    const rows = await store().find<InvitationRecord>("invitations", {
      where: [["orgId", "==", e.orgId]],
    });
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.propertyId === e.propertyId && r.unitId));
    assert.ok(rows.every((r) => r.role === "tenant"));
  });

  await t.test("each gets a unit-linked username of its own", async () => {
    const rows = await store().find<InvitationRecord>("invitations", {
      where: [["orgId", "==", e.orgId]],
    });
    const names = rows.map((r) => r.username!);
    assert.equal(new Set(names).size, 3, "no two share a username");
    assert.ok(
      names.every((n) => /^SP-A\d-[A-Z0-9]{8}$/.test(n)),
      names.join(),
    );
  });

  await t.test("and the invitation really redeems", async () => {
    const first = outcome.ok ? outcome.invitations[0] : null;
    const accepted = await join(
      {
        token: first!.token,
        email: first!.email,
        name: "Ayanda Resident",
        password: pass,
      },
      { ip: "10.31.9.1" },
    );
    const who = (await session(accepted.token))!;
    const live = await workspace(who, e.orgId);
    assert.equal(live.membership.role, "tenant");
    assert.ok(live.membership.unitId, "and lands in a unit");
  });
});

/* ------------------------------------------------------------------ */
/* A file that does not                                                */
/* ------------------------------------------------------------------ */

test("a bad row stops the whole file and is reported by line", async (t) => {
  const e = await estate();

  await t.test("nothing is written when any row fails", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["good@example.test", "A1"],
        ["not-an-email", "A2"],
        ["also.good@example.test", "A3"],
      ]),
    );
    assert.equal(outcome.ok, false);
    assert.deepEqual(await pending(e.orgId), [], "not even the good rows");
  });

  await t.test("the line number is the one in the spreadsheet", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["good@example.test", "A1"],
        ["not-an-email", "A2"],
      ]),
    );
    assert.ok(!outcome.ok);
    // Heading is line 1, so the second resident is on line 3.
    assert.deepEqual(!outcome.ok && outcome.problems.map((p) => p.line), [3]);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /not an email/i,
    );
  });

  await t.test("every problem is reported, not just the first", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["nope", "A1"],
        ["also-nope", "A2"],
        ["third@example.test", "Z9"],
      ]),
    );
    assert.ok(!outcome.ok);
    assert.equal(!outcome.ok && outcome.problems.length, 3);
    assert.match(
      (!outcome.ok && outcome.problems[2].message) || "",
      /no unit called "Z9"/i,
    );
  });

  await t.test("a unit claimed twice in one file is caught", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["one@example.test", "A1"],
        ["two@example.test", "A1"],
      ]),
    );
    assert.ok(!outcome.ok);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /claimed more than once/i,
    );
  });

  await t.test("so is an address repeated in one file", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["same@example.test", "A1"],
        ["same@example.test", "A2"],
      ]),
    );
    assert.ok(!outcome.ok);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /more than once in this file/i,
    );
  });

  await t.test("a unit that is already lived in is refused", async () => {
    const first = await importResidents(
      e.orgId,
      e.property,
      roll([["settled@example.test", "A1"]]),
    );
    assert.ok(first.ok);
    const second = await importResidents(
      e.orgId,
      e.property,
      roll([["another@example.test", "A1"]]),
    );
    assert.ok(!second.ok);
    // The first import left a pending invitation on A1, which is exactly the
    // state that must block the second.
    assert.match(
      (!second.ok && second.problems[0].message) || "",
      /already has a resident or a pending invitation/i,
    );
  });

  await t.test(
    "an address already in the organisation is refused",
    async () => {
      await assert.doesNotReject(
        importResidents(
          e.orgId,
          e.property,
          roll([["fresh@example.test", "A4"]]),
        ),
      );
      const outcome = await importResidents(
        e.orgId,
        e.property,
        roll([[`import${counter}-owner@example.test`, "A5"]]),
      );
      assert.ok(!outcome.ok);
      assert.match(
        (!outcome.ok && outcome.problems[0].message) || "",
        /already belongs to this organisation/i,
      );
    },
  );
});

/* ------------------------------------------------------------------ */
/* The file itself                                                     */
/* ------------------------------------------------------------------ */

test("the file has to be a roll before any row is read", async (t) => {
  const e = await estate();

  await t.test("an empty file says so", async () => {
    await assert.rejects(
      importResidents(e.orgId, e.property, ""),
      /nothing in it/i,
    );
  });

  await t.test("a misspelt heading is caught rather than ignored", async () => {
    await assert.rejects(
      importResidents(
        e.orgId,
        e.property,
        csvDocument([
          ["Emial", "Unit"],
          ["a@b.test", "A1"],
        ]),
      ),
      /column headed Email/i,
    );
  });

  await t.test("headings and no residents is refused", async () => {
    await assert.rejects(
      importResidents(e.orgId, e.property, csvDocument([["Email", "Unit"]])),
      /no residents under them/i,
    );
  });

  await t.test("columns the office already keeps are ignored", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      csvDocument([
        ["Name", "Email", "Phone", "Unit", "Lease start"],
        [
          "Ayanda Molefe",
          "extra@example.test",
          "082 000 0000",
          "A2",
          "2026-01-01",
        ],
      ]),
    );
    assert.ok(outcome.ok, "a manager's own spreadsheet still imports");
  });

  await t.test("the order of the columns does not matter", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      csvDocument([
        ["Unit", "Email"],
        ["A3", "reversed@example.test"],
      ]),
    );
    assert.ok(outcome.ok);
  });

  await t.test("a file larger than the cap is refused whole", async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, n) => [
      `bulk${n}@example.test`,
      `A${n}`,
    ]);
    await assert.rejects(
      importResidents(e.orgId, e.property, roll(rows)),
      new RegExp(`up to ${MAX_IMPORT_ROWS} residents`, "i"),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Student residences                                                  */
/* ------------------------------------------------------------------ */

test("a student residence imports the numbers the institution issued", async (t) => {
  const e = await estate("student_accommodation");

  await t.test("the student number column is required", async () => {
    await assert.rejects(
      importResidents(e.orgId, e.property, roll([["a@b.test", "A1"]])),
      /Student number/i,
    );
  });

  await t.test("leading zeroes survive the spreadsheet", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([["zero@example.test", "A1", "0001234"]], true),
    );
    assert.ok(outcome.ok);
    const invitation = (
      await store().find<InvitationRecord>("invitations", {
        where: [["orgId", "==", e.orgId]],
      })
    )[0];
    assert.equal(invitation.username, "0001234");
    assert.equal(invitation.usernameKey, "0001234");
  });

  await t.test("a number used twice in one file is caught", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll(
        [
          ["one@example.test", "A2", "20250001"],
          ["two@example.test", "A3", "20250001"],
        ],
        true,
      ),
    );
    assert.ok(!outcome.ok);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /appears more than once/i,
    );
  });

  await t.test("and one already enrolled here is caught too", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([["again@example.test", "A4", "0001234"]], true),
    );
    assert.ok(!outcome.ok);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /already enrolled here/i,
    );
  });

  await t.test("a missing number on one row fails that row", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll(
        [
          ["has@example.test", "A5", "20250002"],
          ["hasnt@example.test", "A6", ""],
        ],
        true,
      ),
    );
    assert.ok(!outcome.ok);
    assert.deepEqual(!outcome.ok && outcome.problems.map((p) => p.line), [3]);
  });
});

/* ------------------------------------------------------------------ */
/* Archived units                                                      */
/* ------------------------------------------------------------------ */

test("an archived unit is not somewhere a resident can be put", async () => {
  const e = await estate();
  const live = await workspace(e.owner, e.orgId);
  const a6 = live.units.find((u) => u.label === "A6")!;
  await command(e.owner, e.orgId, { action: "unitArchive", id: a6.id });
  const outcome = await importResidents(
    e.orgId,
    e.property,
    roll([["archived@example.test", "A6"]]),
  );
  assert.ok(!outcome.ok);
  assert.match(
    (!outcome.ok && outcome.problems[0].message) || "",
    /no unit called "A6"/i,
  );
});
