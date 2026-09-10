import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { sastToday } from "../lib/server/visits";
import { store } from "../lib/server/store";
import type { AnnouncementRecord } from "../lib/server/store";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const day = (offset: number) =>
  new Date(Date.parse(`${sastToday()}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);

interface Estate {
  owner: Account;
  orgId: string;
  /** Where the resident, the guard and the reception desk all are. */
  propertyId: string;
  /** A second building, with its own resident. */
  otherPropertyId: string;
  resident: Account;
  neighbour: Account;
  guard: Account;
  reception: Account;
}

let counter = 0;

/**
 * A manager with two buildings: one holding a resident, a guard and a
 * reception desk, and a second holding a resident of its own. Enough to watch
 * an announcement reach the people it is addressed to and nobody else.
 */
async function estate(): Promise<Estate> {
  counter += 1;
  const tag = `board${counter}`;
  const ip = `10.21.0.${counter}`;
  const owner = await register(
    {
      email: `${tag}-owner@example.test`,
      name: "Nomsa Manager",
      organisation: `Board Estate ${counter}`,
      password: pass,
    },
    { ip },
  );
  // Starter sells one office sign-in and the owner holds it, so an estate with
  // a reception desk in it is by definition on a bigger plan.
  await store().tx(async (tx) => {
    tx.update("organisations", owner.orgId, { plan: "growth" });
  });

  const property = async (name: string) =>
    String(
      (
        await command(owner.user, owner.orgId, {
          action: "property",
          name,
          address: "Durban",
          type: "apartment",
        })
      ).id,
    );
  const propertyId = await property(`Court ${counter}`);
  const otherPropertyId = await property(`Annex ${counter}`);

  const unit = async (propertyId: string, label: string) =>
    String(
      (
        await command(owner.user, owner.orgId, {
          action: "unit",
          propertyId,
          label,
          rent: 1000,
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
    { propertyId, unitId: await unit(propertyId, "A1") },
  );
  const neighbour = await accept(
    "tenant",
    `${tag}-neighbour@example.test`,
    "Sipho Neighbour",
    {
      propertyId: otherPropertyId,
      unitId: await unit(otherPropertyId, "B1"),
    },
  );
  const guard = await accept(
    "security",
    `${tag}-guard@example.test`,
    "Piet Gate",
    {
      propertyId,
    },
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
    resident,
    neighbour,
    guard,
    reception,
  };
}

/** Every announcement on this account's board, by title. */
const titles = async (who: Account, orgId: string) =>
  (await workspace(who, orgId)).announcements.map((a) => a.title);

/* ------------------------------------------------------------------ */
/* Who an announcement reaches                                         */
/* ------------------------------------------------------------------ */

test("an announcement reaches the building it is about and stops there", async (t) => {
  const e = await estate();
  await command(e.owner, e.orgId, {
    action: "announce",
    propertyId: e.propertyId,
    audience: "everyone",
    level: "important",
    title: "Water off Tuesday",
    body: "The municipality is replacing the main.",
  });

  await t.test("the residents of that building are told", async () => {
    assert.deepEqual(await titles(e.resident, e.orgId), ["Water off Tuesday"]);
  });

  await t.test("so is the guard on its gate", async () => {
    assert.deepEqual(await titles(e.guard, e.orgId), ["Water off Tuesday"]);
  });

  await t.test("a resident of the other building is not", async () => {
    assert.deepEqual(await titles(e.neighbour, e.orgId), []);
  });

  await t.test("the manager sees it on the office board", async () => {
    const live = await workspace(e.owner, e.orgId);
    const posted = live.announcements[0];
    assert.equal(posted.title, "Water off Tuesday");
    assert.equal(posted.authorName, "Nomsa Manager");
    assert.equal(posted.propertyId, e.propertyId);
    assert.equal(posted.editedAt, null);
    assert.equal(posted.archivedAt, null);
  });
});

test("an organisation-wide announcement reaches every building", async () => {
  const e = await estate();
  await command(e.owner, e.orgId, {
    action: "announce",
    propertyId: "all",
    audience: "residents",
    level: "routine",
    title: "AGM on the 12th",
    body: "Both buildings, in the courtyard.",
  });
  assert.deepEqual(await titles(e.resident, e.orgId), ["AGM on the 12th"]);
  assert.deepEqual(await titles(e.neighbour, e.orgId), ["AGM on the 12th"]);
  // Reception sits in one building and still gets the company-wide one: it is
  // addressed to the organisation, and the desk is in the organisation.
  assert.deepEqual(await titles(e.reception, e.orgId), ["AGM on the 12th"]);
});

test("the audience decides who is told, not the building", async (t) => {
  const e = await estate();
  const announce = (audience: string, title: string) =>
    command(e.owner, e.orgId, {
      action: "announce",
      propertyId: e.propertyId,
      audience,
      level: "urgent",
      title,
      body: "Something has happened.",
    });
  await announce("security", "Boom motor is out");
  await announce("residents", "Lift service on Friday");

  await t.test("the gate gets the one written for the gate", async () => {
    assert.deepEqual(await titles(e.guard, e.orgId), ["Boom motor is out"]);
  });

  await t.test("the resident gets the one written for residents", async () => {
    assert.deepEqual(await titles(e.resident, e.orgId), [
      "Lift service on Friday",
    ]);
  });

  await t.test("the office sees both", async () => {
    const board = await titles(e.owner, e.orgId);
    assert.equal(board.length, 2);
    assert.ok(board.includes("Boom motor is out"));
    assert.ok(board.includes("Lift service on Friday"));
  });
});

test("the loudest announcement is sent first", async () => {
  const e = await estate();
  for (const [level, title] of [
    ["routine", "Newsletter"],
    ["urgent", "Evacuate the east wing"],
    ["important", "Rates increase"],
  ] as const)
    await command(e.owner, e.orgId, {
      action: "announce",
      propertyId: e.propertyId,
      audience: "everyone",
      level,
      title,
      body: "Body.",
    });
  assert.deepEqual(await titles(e.resident, e.orgId), [
    "Evacuate the east wing",
    "Rates increase",
    "Newsletter",
  ]);
});

/* ------------------------------------------------------------------ */
/* When it stops showing                                               */
/* ------------------------------------------------------------------ */

test("an announcement comes down on its own date", async (t) => {
  const e = await estate();
  const id = String(
    (
      await command(e.owner, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "everyone",
        level: "important",
        title: "Fibre installation",
        body: "All rooms connected by Friday.",
        showUntil: day(2),
      })
    ).id,
  );

  await t.test("it shows while the date is ahead", async () => {
    assert.deepEqual(await titles(e.resident, e.orgId), ["Fibre installation"]);
  });

  await t.test("an end date already past is refused", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "everyone",
        level: "routine",
        title: "Stale on arrival",
        body: "Nobody would ever see this.",
        showUntil: day(-1),
      }),
      /already passed/i,
    );
  });

  await t.test("and one a decade out is refused too", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "everyone",
        level: "routine",
        title: "Typed the wrong year",
        body: "3026 rather than 2026.",
        showUntil: day(4000),
      }),
      /within the next year/i,
    );
  });

  // The clock is what takes it down, so the clock is what the test moves.
  await t.test("once the date has passed it drops off dashboards", async () => {
    await store().tx(async (tx) => {
      tx.update("announcements", id, { showUntil: day(-1) });
    });
    assert.deepEqual(await titles(e.resident, e.orgId), []);
    assert.deepEqual(await titles(e.guard, e.orgId), []);
  });

  await t.test("but stays on the office's own board", async () => {
    const live = await workspace(e.owner, e.orgId);
    const posted = live.announcements.find((a) => a.id === id);
    assert.ok(posted, "the office can still see what it said");
    assert.equal(posted!.showUntil, day(-1));
    assert.equal(posted!.archivedAt, null, "expired is not taken down");
  });
});

test("taking one down clears it from dashboards and keeps it on the board", async (t) => {
  const e = await estate();
  const id = String(
    (
      await command(e.owner, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "everyone",
        level: "urgent",
        title: "Gate is stuck open",
        body: "Do not leave the building unattended.",
      })
    ).id,
  );
  assert.deepEqual(await titles(e.resident, e.orgId), ["Gate is stuck open"]);

  await command(e.owner, e.orgId, { action: "announcementTakeDown", id });

  await t.test("the resident no longer has it", async () => {
    assert.deepEqual(await titles(e.resident, e.orgId), []);
  });

  await t.test("the office still does, and can see it went up", async () => {
    const live = await workspace(e.owner, e.orgId);
    const posted = live.announcements.find((a) => a.id === id);
    assert.ok(posted, "taken down, never deleted");
    assert.ok(posted!.archivedAt, "and marked as such");
  });

  await t.test("a taken-down announcement cannot be corrected", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "announcementUpdate",
        id,
        level: "routine",
        title: "Gate is fine actually",
        body: "Never mind.",
      }),
      /taken down/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */

test("what an announcement says can be corrected; who it went to cannot", async (t) => {
  const e = await estate();
  const id = String(
    (
      await command(e.owner, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "residents",
        level: "routine",
        title: "Water off Tuesday",
        body: "09:00 to 15:00.",
      })
    ).id,
  );

  await command(e.owner, e.orgId, {
    action: "announcementUpdate",
    id,
    level: "important",
    title: "Water off Thursday",
    body: "09:00 to 15:00. The date moved.",
    // Offered and ignored: the people it reached are already holding it.
    audience: "security",
    propertyId: e.otherPropertyId,
  });

  await t.test("the correction reaches the same people", async () => {
    const live = await workspace(e.resident, e.orgId);
    const posted = live.announcements.find((a) => a.id === id);
    assert.ok(posted, "still the resident's announcement");
    assert.equal(posted!.title, "Water off Thursday");
    assert.equal(posted!.level, "important");
    assert.ok(posted!.editedAt, "and is visibly a correction");
  });

  await t.test("and never moves to a different audience", async () => {
    const live = await workspace(e.owner, e.orgId);
    const posted = live.announcements.find((a) => a.id === id)!;
    assert.equal(posted.audience, "residents");
    assert.equal(posted.propertyId, e.propertyId);
    // The guard was never addressed and is not addressed now.
    assert.deepEqual(await titles(e.guard, e.orgId), []);
  });
});

/* ------------------------------------------------------------------ */
/* Who may announce                                                    */
/* ------------------------------------------------------------------ */

test("only the office announces, and reception only for its own building", async (t) => {
  const e = await estate();

  await t.test("a resident cannot announce", async () => {
    await assert.rejects(
      command(e.resident, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "everyone",
        level: "urgent",
        title: "Party at mine",
        body: "Everyone welcome.",
      }),
      /manager or reception/i,
    );
  });

  await t.test("neither can a guard", async () => {
    await assert.rejects(
      command(e.guard, e.orgId, {
        action: "announce",
        propertyId: e.propertyId,
        audience: "security",
        level: "routine",
        title: "Shift swap",
        body: "Covering Thursday.",
      }),
      /manager or reception/i,
    );
  });

  await t.test("reception announces to the building it sits in", async () => {
    const id = String(
      (
        await command(e.reception, e.orgId, {
          action: "announce",
          propertyId: e.propertyId,
          audience: "residents",
          level: "routine",
          title: "Parcels are in at the desk",
          body: "Collect before six.",
        })
      ).id,
    );
    const live = await workspace(e.resident, e.orgId);
    assert.ok(live.announcements.some((a) => a.id === id));
  });

  await t.test("and never to the whole organisation", async () => {
    await assert.rejects(
      command(e.reception, e.orgId, {
        action: "announce",
        propertyId: "all",
        audience: "residents",
        level: "routine",
        title: "Speaking for everybody",
        body: "Both buildings, from one desk.",
      }),
      /own property/i,
    );
  });

  await t.test("nor to a building it does not sit in", async () => {
    await assert.rejects(
      command(e.reception, e.orgId, {
        action: "announce",
        propertyId: e.otherPropertyId,
        audience: "residents",
        level: "routine",
        title: "Next door's business",
        body: "Not this desk's to say.",
      }),
      /not available/i,
    );
  });

  await t.test(
    "and cannot take down an announcement made to another building",
    async () => {
      const elsewhere = String(
        (
          await command(e.owner, e.orgId, {
            action: "announce",
            propertyId: e.otherPropertyId,
            audience: "residents",
            level: "routine",
            title: "Annex only",
            body: "Nothing to do with Court.",
          })
        ).id,
      );
      await assert.rejects(
        command(e.reception, e.orgId, {
          action: "announcementTakeDown",
          id: elsewhere,
        }),
        /not found/i,
      );
    },
  );
});

/* ------------------------------------------------------------------ */
/* Entitlement                                                         */
/* ------------------------------------------------------------------ */

test("a lapsed organisation can still tell its residents the water is off", async () => {
  const e = await estate();
  await store().tx(async (tx) => {
    tx.update("organisations", e.orgId, {
      trialUntil: "2020-01-01T00:00:00.000Z",
      paidUntil: null,
    });
  });
  // Creating properties, units and passes waits for renewal. Telling people
  // something does not: withholding it would not prompt a payment, it would
  // leave a building that does not know its water is off.
  await command(e.owner, e.orgId, {
    action: "announce",
    propertyId: e.propertyId,
    audience: "everyone",
    level: "urgent",
    title: "Water off from noon",
    body: "Burst main on the corner.",
  });
  assert.deepEqual(await titles(e.resident, e.orgId), ["Water off from noon"]);
});

/* ------------------------------------------------------------------ */
/* Isolation                                                           */
/* ------------------------------------------------------------------ */

test("an announcement never leaves its organisation", async () => {
  const a = await estate();
  const b = await estate();
  const id = String(
    (
      await command(a.owner, a.orgId, {
        action: "announce",
        propertyId: "all",
        audience: "everyone",
        level: "urgent",
        title: "Ours alone",
        body: "Nobody else's business.",
      })
    ).id,
  );
  assert.deepEqual(await titles(b.resident, b.orgId), []);
  await assert.rejects(
    command(b.owner, b.orgId, { action: "announcementTakeDown", id }),
    /not found/i,
  );
  // And it really is still there, on the board it belongs to.
  const still = await store().get<AnnouncementRecord>("announcements", id);
  assert.equal(still?.archivedAt, null);
});
