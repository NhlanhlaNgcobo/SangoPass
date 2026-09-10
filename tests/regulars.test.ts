import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { sastToday } from "../lib/server/visits";
import {
  allowsDay,
  describeDays,
  standing,
  weekdayIndex,
} from "../lib/shared/regulars";
import { sastTime } from "../lib/server/regulars";
import { store } from "../lib/server/store";
import type { MovementRecord, RegularRecord } from "../lib/server/store";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const day = (offset: number) =>
  new Date(Date.parse(`${sastToday()}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);

/** Every day of the week, so a test is never refused for being run on a Sunday. */
const EVERY_DAY = "1111111";

/** The whole clock, so a test never fails because it ran at 18:05. */
const ALL_HOURS = { fromTime: "00:00", toTime: "23:59" };

interface Estate {
  owner: Account;
  orgId: string;
  propertyId: string;
  otherPropertyId: string;
  unitId: string;
  resident: Account;
  guard: Account;
  reception: Account;
}

let counter = 0;

async function estate(): Promise<Estate> {
  counter += 1;
  const tag = `reg${counter}`;
  const ip = `10.41.0.${counter}`;
  const owner = await register(
    {
      email: `${tag}-owner@example.test`,
      name: "Nomsa Manager",
      organisation: `Regular Estate ${counter}`,
      password: pass,
    },
    { ip },
  );
  await store().tx(async (tx) => {
    tx.update("organisations", owner.orgId, { plan: "growth" });
  });
  const property = async (name: string) =>
    String(
      (
        await command(owner.user, owner.orgId, {
          action: "property",
          name,
          address: "Johannesburg",
          type: "apartment",
        })
      ).id,
    );
  const propertyId = await property(`Court ${counter}`);
  const otherPropertyId = await property(`Annex ${counter}`);
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: "A1",
        rent: 7000,
      })
    ).id,
  );
  const accept = async (
    role: string,
    email: string,
    name: string,
    extra: Record<string, unknown>,
  ) => {
    const invitation = await command(owner.user, owner.orgId, {
      action: "invite",
      email,
      role,
      ...extra,
    });
    const accepted = await join(
      { token: invitation.token, email, name, password: pass },
      { ip },
    );
    return (await session(accepted.token))!;
  };
  const resident = await accept(
    "tenant",
    `${tag}-resident@example.test`,
    "Aisha Resident",
    { propertyId, unitId },
  );
  const guard = await accept(
    "security",
    `${tag}-guard@example.test`,
    "Piet Gate",
    { propertyId },
  );
  const reception = await accept(
    "reception",
    `${tag}-desk@example.test`,
    "Fatima Desk",
    { propertyId },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    otherPropertyId,
    unitId,
    resident,
    guard,
    reception,
  };
}

/** A staff pass valid every day, all hours, for a year. */
const staffPass = (e: Estate, over: Record<string, unknown> = {}) => ({
  action: "regular",
  propertyId: e.propertyId,
  personName: "Grace Mthembu",
  occupation: "Cleaner",
  phone: "+27 82 555 0111",
  kind: "staff",
  idType: "sa_id",
  idNumber: "8001015009087",
  days: EVERY_DAY,
  ...ALL_HOURS,
  startDate: day(-1),
  endDate: day(120),
  ...over,
});

const issue = async (e: Estate, over: Record<string, unknown> = {}) =>
  String((await command(e.owner, e.orgId, staffPass(e, over))).id);

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

test("the days string starts on Monday", async (t) => {
  await t.test("a known Monday is slot zero", () => {
    // 2026-09-07 is a Monday.
    assert.equal(weekdayIndex("2026-09-07"), 0);
    assert.equal(weekdayIndex("2026-09-13"), 6, "and Sunday is slot six");
  });

  await t.test("a weekday pass admits on Friday and not Saturday", () => {
    assert.equal(allowsDay("1111100", "2026-09-11"), true);
    assert.equal(allowsDay("1111100", "2026-09-12"), false);
  });

  await t.test("the schedule reads the way a roster is written", () => {
    assert.equal(describeDays("1111111"), "Every day");
    assert.equal(describeDays("1111100"), "Mon to Fri");
    assert.equal(describeDays("1010100"), "Mon, Wed, Fri");
    assert.equal(describeDays("0000011"), "Sat, Sun");
    assert.equal(describeDays("0111000"), "Tue to Thu");
  });
});

test("where a pass stands is read off the calendar", () => {
  const today = sastToday();
  const base = { startDate: day(-5), endDate: day(5), revokedAt: null };
  assert.equal(standing(base, today), "active");
  assert.equal(standing({ ...base, startDate: day(2) }, today), "pending");
  assert.equal(standing({ ...base, endDate: day(-1) }, today), "expired");
  // Revoking beats every date, because it is a decision rather than a clock.
  assert.equal(
    standing({ ...base, revokedAt: "2026-01-01T00:00:00.000Z" }, today),
    "revoked",
  );
});

/* ------------------------------------------------------------------ */
/* Who may issue one                                                   */
/* ------------------------------------------------------------------ */

test("only the office issues a standing pass", async (t) => {
  const e = await estate();

  await t.test("a manager can", async () => {
    const id = await issue(e);
    const record = await store().get<RegularRecord>("regulars", id);
    assert.equal(record!.personName, "Grace Mthembu");
    assert.equal(record!.issuedByName, "Nomsa Manager");
    assert.ok(record!.entryCode, "and it carries a gate code");
    assert.ok(record!.token, "and a pass link");
    assert.equal(record!.revokedAt, null);
  });

  await t.test("so can reception, for its own building", async () => {
    const created = await command(e.reception, e.orgId, staffPass(e));
    assert.ok(created.id);
  });

  await t.test("but not for a building it does not sit in", async () => {
    await assert.rejects(
      command(e.reception, e.orgId, {
        ...staffPass(e),
        propertyId: e.otherPropertyId,
      }),
      /not available/i,
    );
  });

  await t.test(
    "a resident cannot issue one, even for their own door",
    async () => {
      await assert.rejects(
        command(e.resident, e.orgId, {
          ...staffPass(e),
          kind: "household",
          unitId: e.unitId,
        }),
        /manager or reception/i,
      );
    },
  );

  await t.test("neither can a guard", async () => {
    await assert.rejects(
      command(e.guard, e.orgId, staffPass(e)),
      /manager or reception/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/* What a pass may say                                                 */
/* ------------------------------------------------------------------ */

test("a pass has to describe a week somebody could actually work", async (t) => {
  const e = await estate();

  await t.test("no days at all is refused", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, staffPass(e, { days: "0000000" })),
      /at least one day/i,
    );
  });

  await t.test("a window that ends before it starts is refused", async () => {
    await assert.rejects(
      command(
        e.owner,
        e.orgId,
        staffPass(e, { fromTime: "17:00", toTime: "07:00" }),
      ),
      /end after it starts/i,
    );
  });

  await t.test("an end date already gone is refused", async () => {
    await assert.rejects(
      command(
        e.owner,
        e.orgId,
        staffPass(e, { startDate: day(-30), endDate: day(-1) }),
      ),
      /already passed/i,
    );
  });

  await t.test("and one more than a year out is refused", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, staffPass(e, { endDate: day(400) })),
      /at most a year/i,
    );
  });

  await t.test("the identity number is checked like a visitor's", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, staffPass(e, { idNumber: "8001015009088" })),
      /checksum/i,
    );
  });

  await t.test(
    "a household worker must name the unit they work at",
    async () => {
      await assert.rejects(
        command(e.owner, e.orgId, staffPass(e, { kind: "household" })),
        /unit this person works at/i,
      );
      const id = String(
        (
          await command(e.owner, e.orgId, {
            ...staffPass(e),
            kind: "household",
            unitId: e.unitId,
          })
        ).id,
      );
      const record = await store().get<RegularRecord>("regulars", id);
      assert.equal(record!.unitLabel, "A1");
    },
  );

  await t.test("staff and contractors carry no unit", async () => {
    const id = await issue(e, { kind: "contractor", employer: "Cape Roofing" });
    const record = await store().get<RegularRecord>("regulars", id);
    assert.equal(record!.unitId, null);
    assert.equal(record!.employer, "Cape Roofing");
  });
});

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

test("the gate records every arrival and departure", async (t) => {
  const e = await estate();
  const id = await issue(e);

  await t.test("the guard signs them in", async () => {
    await command(e.guard, e.orgId, {
      action: "movement",
      id,
      direction: "in",
    });
    const live = await workspace(e.guard, e.orgId);
    assert.equal(live.movements.length, 1);
    assert.equal(live.movements[0].personName, "Grace Mthembu");
    assert.equal(live.movements[0].inByName, "Piet Gate");
    assert.equal(live.movements[0].outAt, null, "and she is on site");
    assert.equal(live.movements[0].date, sastToday());
  });

  await t.test("signing in twice is refused", async () => {
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /already signed in/i,
    );
  });

  await t.test("and signing out closes that same arrival", async () => {
    await command(e.guard, e.orgId, {
      action: "movement",
      id,
      direction: "out",
    });
    const live = await workspace(e.guard, e.orgId);
    assert.equal(live.movements.length, 1, "one arrival, not two rows");
    assert.ok(live.movements[0].outAt);
    assert.equal(live.movements[0].outByName, "Piet Gate");
  });

  await t.test("signing out again has nothing to close", async () => {
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "out" }),
      /nothing to sign out/i,
    );
  });

  await t.test("the next day is a second arrival, not an edit", async () => {
    await command(e.guard, e.orgId, {
      action: "movement",
      id,
      direction: "in",
    });
    const live = await workspace(e.guard, e.orgId);
    assert.equal(live.movements.length, 2);
    // Newest first: the open one is on top.
    assert.equal(live.movements[0].outAt, null);
    assert.ok(live.movements[1].outAt);
  });

  await t.test("a resident never records an arrival", async () => {
    await assert.rejects(
      command(e.resident, e.orgId, {
        action: "movement",
        id,
        direction: "out",
      }),
      /guard or reception/i,
    );
  });
});

test("the gate refuses what the pass does not authorise", async (t) => {
  const e = await estate();

  await t.test("a day the person is not down for", async () => {
    // Every day but today.
    const days = [..."1111111"];
    days[
      new Date(`${sastToday()}T00:00:00Z`).getUTCDay() === 0
        ? 6
        : new Date(`${sastToday()}T00:00:00Z`).getUTCDay() - 1
    ] = "0";
    const id = await issue(e, { days: days.join("") });
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /not down for today/i,
    );
  });

  await t.test("an hour outside the daily window", async () => {
    // Built from the clock the server reads, so the window is certainly shut
    // whenever the suite happens to run rather than usually shut.
    const [hour] = sastTime().split(":").map(Number);
    const shut =
      hour < 12
        ? { fromTime: "22:00", toTime: "23:30" }
        : { fromTime: "00:30", toTime: "02:00" };
    const id = await issue(e, shut);
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /admits between/i,
    );
  });

  await t.test("a pass that has not started", async () => {
    const id = await issue(e, { startDate: day(3), endDate: day(30) });
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /does not start until/i,
    );
  });

  await t.test("and one that has been revoked", async () => {
    const id = await issue(e);
    await command(e.owner, e.orgId, { action: "regularRevoke", id });
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /revoked/i,
    );
  });

  await t.test("an expired pass says who has to renew it", async () => {
    const id = await issue(e);
    // The clock is what expires it, so the clock is what the test moves.
    await store().tx(async (tx) => {
      tx.update("regulars", id, { startDate: day(-40), endDate: day(-1) });
    });
    await assert.rejects(
      command(e.guard, e.orgId, { action: "movement", id, direction: "in" }),
      /expired on .* office has to renew/i,
    );
  });

  await t.test("somebody left on site can still be signed out", async () => {
    const id = await issue(e);
    await command(e.guard, e.orgId, {
      action: "movement",
      id,
      direction: "in",
    });
    // Revoked while they are inside: they still have to be let out, and the
    // register has to stop saying they never went home.
    await command(e.owner, e.orgId, { action: "regularRevoke", id });
    await command(e.guard, e.orgId, {
      action: "movement",
      id,
      direction: "out",
    });
    const open = await store().find<MovementRecord>("movements", {
      where: [
        ["regularId", "==", id],
        ["open", "==", 1],
      ],
    });
    assert.equal(open.length, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Who sees what                                                       */
/* ------------------------------------------------------------------ */

test("a standing pass reaches the gate, the office, and the door it is for", async (t) => {
  const e = await estate();
  const staff = await issue(e);
  const household = String(
    (
      await command(e.owner, e.orgId, {
        ...staffPass(e),
        personName: "Nomvula Sithole",
        occupation: "Domestic worker",
        kind: "household",
        unitId: e.unitId,
      })
    ).id,
  );

  await t.test(
    "the guard sees both, because both come through the gate",
    async () => {
      const live = await workspace(e.guard, e.orgId);
      assert.equal(live.regulars.length, 2);
    },
  );

  await t.test("the manager sees both", async () => {
    const live = await workspace(e.owner, e.orgId);
    assert.equal(live.regulars.length, 2);
  });

  await t.test("a resident reads none of the board", async () => {
    const live = await workspace(e.resident, e.orgId);
    // Not even the one working at their own door. A standing pass is the
    // office's to issue and the estate's staff list was never a tenancy's
    // business; a resident who wants one asks for it from My requests, and
    // the answer comes back there.
    assert.deepEqual(live.regulars, []);
    void household;
    void staff;
  });

  await t.test("and no resident reads the gate register", async () => {
    await command(e.guard, e.orgId, {
      action: "movement",
      id: household,
      direction: "in",
    });
    const live = await workspace(e.resident, e.orgId);
    assert.deepEqual(live.movements, []);
  });

  await t.test("the full identity number never leaves the server", async () => {
    const live = await workspace(e.owner, e.orgId);
    for (const regular of live.regulars) {
      assert.ok(!regular.idNumber.includes("8001015009087"));
      assert.match(regular.idNumber, /9087$/, "the last four still read");
    }
  });
});

test("a standing pass never leaves its organisation", async () => {
  const a = await estate();
  const b = await estate();
  const id = await issue(a);
  const live = await workspace(b.owner, b.orgId);
  assert.equal(live.regulars.length, 0);
  await assert.rejects(
    command(b.owner, b.orgId, { action: "regularRevoke", id }),
    /not found/i,
  );
  await assert.rejects(
    command(b.guard, b.orgId, { action: "movement", id, direction: "in" }),
    /not found/i,
  );
});

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

test("a regular's gate code can never collide with a visitor's", async () => {
  const e = await estate();
  const id = await issue(e);
  const record = (await store().get<RegularRecord>("regulars", id))!;
  // Both kinds of pass claim their code in one namespace, so the guard's one
  // box always lands on exactly one pass.
  const held = await store().get<{ owner: string }>(
    "reservations",
    `visitorCode:${record.entryCode}`,
  );
  assert.equal(held?.owner, id);
  const token = await store().get<{ owner: string }>(
    "reservations",
    `visitorToken:${record.token}`,
  );
  assert.equal(token?.owner, id);
});
