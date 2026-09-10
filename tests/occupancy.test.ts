import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { importResidents } from "../lib/server/enrolment";
import { csvDocument } from "../lib/shared/csv";
import { PLANS, effectivePlanId } from "../lib/shared/plans";
import { describeShape } from "../lib/server/occupancy-rules";
import { store } from "../lib/server/store";
import type {
  PropertyRecord,
  TenancyRecord,
  UnitRecord,
} from "../lib/server/store";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

interface Estate {
  owner: Account;
  orgId: string;
  propertyId: string;
  property: PropertyRecord;
}

let counter = 0;

/** A manager on a paid tier, so the free caps are not in the way. */
async function estate(): Promise<Estate> {
  counter += 1;
  const owner = await register(
    {
      email: `occ${counter}-owner@example.test`,
      name: "Nomsa Manager",
      organisation: `Occupancy Estate ${counter}`,
      password: pass,
    },
    { ip: `10.51.0.${counter}` },
  );
  await store().tx(async (tx) => {
    tx.update("organisations", owner.orgId, { plan: "growth" });
  });
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Court ${counter}`,
        address: "Cape Town",
        type: "apartment",
      })
    ).id,
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    property: (await store().get<PropertyRecord>("properties", propertyId))!,
  };
}

const addUnit = async (
  e: Estate,
  label: string,
  over: Record<string, unknown> = {},
) =>
  String(
    (
      await command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label,
        rent: 8000,
        ...over,
      })
    ).id,
  );

/** Enrol somebody and have them redeem, returning their account. */
async function moveIn(e: Estate, unitId: string, who: string) {
  const email = `${who}@example.test`;
  const invitation = await command(e.owner, e.orgId, {
    action: "invite",
    propertyId: e.propertyId,
    unitId,
    role: "tenant",
    email,
  });
  const accepted = await join(
    { token: invitation.token, email, name: who, password: pass },
    { ip: `10.51.9.${counter}` },
  );
  return (await session(accepted.token))!;
}

const unitOf = async (id: string) =>
  (await store().get<UnitRecord>("units", id))!;

/* ------------------------------------------------------------------ */
/* The shape of a unit                                                 */
/* ------------------------------------------------------------------ */

test("a unit records what it is and how many it holds", async (t) => {
  const e = await estate();

  await t.test("a unit created without saying holds one person", async () => {
    const id = await addUnit(e, "A1");
    const unit = await unitOf(id);
    assert.equal(unit.maxOccupants, 1, "which is what the product always did");
    assert.equal(unit.bedrooms, 0, "and nobody has said how big it is");
    assert.equal(unit.occupants, 0);
  });

  await t.test("a manager describes the real building", async () => {
    const id = await addUnit(e, "A2", { bedrooms: 2, maxOccupants: 3 });
    const unit = await unitOf(id);
    assert.equal(unit.bedrooms, 2);
    assert.equal(unit.maxOccupants, 3);
  });

  await t.test(
    "the limit is theirs, not derived from the bedrooms",
    async () => {
      // A family of five in a two-bedroom is an ordinary letting. The product
      // does not argue with the person who has been inside the building.
      const id = await addUnit(e, "A3", { bedrooms: 2, maxOccupants: 5 });
      assert.equal((await unitOf(id)).maxOccupants, 5);
    },
  );

  await t.test("nonsense is refused", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "Bad1",
        rent: 100,
        maxOccupants: 0,
      }),
      /between 1 and 40/,
    );
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "Bad2",
        rent: 100,
        bedrooms: -1,
      }),
      /between 0 and 20/,
    );
  });

  await t.test("it reads the way a listing reads", () => {
    assert.equal(
      describeShape({ bedrooms: 2, maxOccupants: 3 }),
      "2 bedrooms · up to 3 people",
    );
    assert.equal(
      describeShape({ bedrooms: 1, maxOccupants: 1 }),
      "1 bedroom · up to 1 person",
    );
    assert.equal(
      describeShape({ bedrooms: 0, maxOccupants: 4 }),
      "up to 4 people",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Sharing a unit                                                      */
/* ------------------------------------------------------------------ */

test("a unit holds as many people as its manager says", async (t) => {
  const e = await estate();
  const shared = await addUnit(e, "S1", { bedrooms: 2, maxOccupants: 3 });

  await t.test("three sharers all move in", async () => {
    await moveIn(e, shared, "ayanda");
    await moveIn(e, shared, "sipho");
    await moveIn(e, shared, "fatima");
    const unit = await unitOf(shared);
    assert.equal(unit.occupants, 3);
    assert.equal(unit.residentName, "ayanda", "the first in is the one shown");
  });

  await t.test("a fourth is refused, naming the limit", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "invite",
        propertyId: e.propertyId,
        unitId: shared,
        role: "tenant",
        email: "fourth@example.test",
      }),
      /S1 is full: it holds 3 people/,
    );
  });

  await t.test("each sharer has their own open stay", async () => {
    const stays = await store().find<TenancyRecord>("tenancies", {
      where: [
        ["unitId", "==", shared],
        ["current", "==", 1],
      ],
    });
    assert.equal(stays.length, 3, "one tenancy per person, not per unit");
  });

  await t.test("a single-occupant unit still takes exactly one", async () => {
    const solo = await addUnit(e, "S2");
    await moveIn(e, solo, "solo");
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "invite",
        propertyId: e.propertyId,
        unitId: solo,
        role: "tenant",
        email: "second@example.test",
      }),
      /S2 is full: it holds 1 person/,
    );
  });

  await t.test("an unredeemed invitation holds a place", async () => {
    const two = await addUnit(e, "S3", { bedrooms: 1, maxOccupants: 2 });
    await command(e.owner, e.orgId, {
      action: "invite",
      propertyId: e.propertyId,
      unitId: two,
      role: "tenant",
      email: "pending1@example.test",
    });
    await command(e.owner, e.orgId, {
      action: "invite",
      propertyId: e.propertyId,
      unitId: two,
      role: "tenant",
      email: "pending2@example.test",
    });
    // Nobody has redeemed either, and the flat is already spoken for.
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "invite",
        propertyId: e.propertyId,
        unitId: two,
        role: "tenant",
        email: "pending3@example.test",
      }),
      /is full/,
    );
  });
});

test("a sharer leaving frees their place and hands on the name", async (t) => {
  const e = await estate();
  const shared = await addUnit(e, "T1", { bedrooms: 2, maxOccupants: 3 });
  const first = await moveIn(e, shared, "first");
  const second = await moveIn(e, shared, "second");
  await moveIn(e, shared, "third");

  await t.test("the register shows the first occupant", async () => {
    const unit = await unitOf(shared);
    assert.equal(unit.residentId, first.id);
    assert.equal(unit.occupants, 3);
  });

  await t.test("when they go, the next one takes the name", async () => {
    await command(e.owner, e.orgId, { action: "removeMember", id: first.id });
    const unit = await unitOf(shared);
    assert.equal(unit.occupants, 2);
    assert.equal(unit.residentId, second.id, "not left pointing at nobody");
    assert.equal(unit.residentName, "second");
  });

  await t.test("only their own stay is closed", async () => {
    const open = await store().find<TenancyRecord>("tenancies", {
      where: [
        ["unitId", "==", shared],
        ["current", "==", 1],
      ],
    });
    assert.equal(open.length, 2);
    assert.ok(
      !open.some((s) => s.residentId === first.id),
      "the departing resident's stay is the one that closed",
    );
  });

  await t.test(
    "removing someone who is not the shown name keeps it",
    async () => {
      const unit = await unitOf(shared);
      const other = (
        await store().find<TenancyRecord>("tenancies", {
          where: [
            ["unitId", "==", shared],
            ["current", "==", 1],
          ],
        })
      ).find((s) => s.residentId !== unit.residentId)!;
      await command(e.owner, e.orgId, {
        action: "removeMember",
        id: other.residentId,
      });
      const after = await unitOf(shared);
      assert.equal(after.occupants, 1);
      assert.equal(after.residentId, second.id, "the shown name did not move");
    },
  );

  await t.test("the last one out empties the unit", async () => {
    await command(e.owner, e.orgId, { action: "removeMember", id: second.id });
    const unit = await unitOf(shared);
    assert.equal(unit.occupants, 0);
    assert.equal(unit.residentId, null);
    assert.equal(unit.rentPaid, 0, "and the rent flag is cleared for the next");
  });
});

test("a unit somebody lives in is protected", async (t) => {
  const e = await estate();
  const shared = await addUnit(e, "U1", { bedrooms: 2, maxOccupants: 3 });
  await moveIn(e, shared, "one");
  await moveIn(e, shared, "two");

  await t.test("its limit cannot drop below the people in it", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "unitUpdate",
        id: shared,
        label: "U1",
        rent: 8000,
        maxOccupants: 1,
      }),
      /2 people live in U1/,
    );
  });

  await t.test("but may be raised, and the bedrooms corrected", async () => {
    await command(e.owner, e.orgId, {
      action: "unitUpdate",
      id: shared,
      label: "U1",
      rent: 8000,
      bedrooms: 3,
      maxOccupants: 4,
    });
    const unit = await unitOf(shared);
    assert.equal(unit.maxOccupants, 4);
    assert.equal(unit.bedrooms, 3);
  });

  await t.test("an edit that says nothing leaves the shape alone", async () => {
    await command(e.owner, e.orgId, {
      action: "unitUpdate",
      id: shared,
      label: "U1",
      rent: 9000,
    });
    const unit = await unitOf(shared);
    assert.equal(unit.maxOccupants, 4, "not reset by an unrelated edit");
    assert.equal(unit.bedrooms, 3);
    assert.equal(unit.rentCents, 900000);
  });

  await t.test("it cannot be archived while shared", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, { action: "unitArchive", id: shared }),
      /2 residents still live in U1/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* The free tier                                                       */
/* ------------------------------------------------------------------ */

test("the free tier is what an organisation falls to, not a wall", async (t) => {
  await t.test("a live trial is on the tier it signed up for", () => {
    assert.equal(
      effectivePlanId({
        plan: "starter",
        trialUntil: new Date(Date.now() + 86400000).toISOString(),
        paidUntil: null,
      }),
      "starter",
    );
  });

  await t.test("a paid month outlives an ended trial", () => {
    assert.equal(
      effectivePlanId({
        plan: "premium",
        trialUntil: "2020-01-01T00:00:00.000Z",
        paidUntil: new Date(Date.now() + 86400000).toISOString(),
      }),
      "premium",
    );
  });

  await t.test("neither one live means free", () => {
    assert.equal(
      effectivePlanId({
        plan: "premium",
        trialUntil: "2020-01-01T00:00:00.000Z",
        paidUntil: "2020-06-01T00:00:00.000Z",
      }),
      "free",
    );
  });

  await t.test("free is five units and ten residents", () => {
    assert.equal(PLANS.free.units, 5);
    assert.equal(PLANS.free.residents, 10);
    assert.equal(PLANS.free.priceCents, 0);
    // Only the free tier counts people; a paid tier sells units.
    for (const paid of ["starter", "growth", "premium"] as const)
      assert.equal(PLANS[paid].residents, null, paid);
  });
});

test("the free tier stops at ten residents", async (t) => {
  const e = await estate();
  // Drop to free by ending the trial, as an unpaid organisation does.
  await store().tx(async (tx) => {
    tx.update("organisations", e.orgId, {
      trialUntil: "2020-01-01T00:00:00.000Z",
      paidUntil: null,
    });
  });
  // Five three-person units: fifteen beds, so the tier runs out of residents
  // long before it runs out of units, which is what this is measuring.
  const units: string[] = [];
  for (let n = 1; n <= PLANS.free.units; n += 1)
    units.push(await addUnit(e, `R${n}`, { bedrooms: 2, maxOccupants: 3 }));

  await t.test("ten can be invited", async () => {
    let sent = 0;
    for (const unitId of units)
      for (let seat = 0; seat < 2; seat += 1) {
        await command(e.owner, e.orgId, {
          action: "invite",
          propertyId: e.propertyId,
          unitId,
          role: "tenant",
          email: `free${sent}@example.test`,
        });
        sent += 1;
      }
    assert.equal(sent, PLANS.free.residents);
  });

  await t.test("the eleventh is refused, and says why", async () => {
    // R1 still has a third bed free, so nothing but the tier stops this.
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "invite",
        propertyId: e.propertyId,
        unitId: units[0],
        role: "tenant",
        email: "eleventh@example.test",
      }),
      /free tier holds 10 residents/,
    );
  });

  await t.test("a paid tier does not count residents at all", async () => {
    await store().tx(async (tx) => {
      tx.update("organisations", e.orgId, {
        plan: "growth",
        paidUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    });
    const eleventh = await command(e.owner, e.orgId, {
      action: "invite",
      propertyId: e.propertyId,
      unitId: units[0],
      role: "tenant",
      email: "paid-eleventh@example.test",
    });
    assert.ok(eleventh.token);
  });
});

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

test("a roll may fill a shared unit, and may not overfill it", async (t) => {
  const e = await estate();
  await addUnit(e, "I1", { bedrooms: 2, maxOccupants: 3 });
  await addUnit(e, "I2");

  const roll = (rows: string[][]) => csvDocument([["Email", "Unit"], ...rows]);

  await t.test("three sharers in a three-person flat", async () => {
    const outcome = await importResidents(
      e.orgId,
      e.property,
      roll([
        ["a@example.test", "I1"],
        ["b@example.test", "I1"],
        ["c@example.test", "I1"],
      ]),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.ok && outcome.invitations.length, 3);
  });

  await t.test("a fourth in the same file is caught by line", async () => {
    const fresh = await estate();
    await addUnit(fresh, "I1", { bedrooms: 2, maxOccupants: 3 });
    const outcome = await importResidents(
      fresh.orgId,
      fresh.property,
      roll([
        ["a@example.test", "I1"],
        ["b@example.test", "I1"],
        ["c@example.test", "I1"],
        ["d@example.test", "I1"],
      ]),
    );
    assert.ok(!outcome.ok);
    assert.deepEqual(!outcome.ok && outcome.problems.map((p) => p.line), [5]);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /puts 4 people in I1, which holds 3/,
    );
  });

  await t.test(
    "a single-occupant unit named twice still reads clearly",
    async () => {
      const fresh = await estate();
      await addUnit(fresh, "I2");
      const outcome = await importResidents(
        fresh.orgId,
        fresh.property,
        roll([
          ["a@example.test", "I2"],
          ["b@example.test", "I2"],
        ]),
      );
      assert.ok(!outcome.ok);
      assert.match(
        (!outcome.ok && outcome.problems[0].message) || "",
        /claimed more than once/i,
      );
    },
  );

  await t.test("the free tier's remaining room bounds a roll", async () => {
    const fresh = await estate();
    await addUnit(fresh, "F1", { maxOccupants: 3 });
    const outcome = await importResidents(
      fresh.orgId,
      fresh.property,
      roll([
        ["a@example.test", "F1"],
        ["b@example.test", "F1"],
        ["c@example.test", "F1"],
      ]),
      2,
    );
    assert.ok(!outcome.ok);
    assert.match(
      (!outcome.ok && outcome.problems[0].message) || "",
      /room for 2 more residents/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* What a resident sees                                                */
/* ------------------------------------------------------------------ */

test("sharers draw on one guest allowance, because the door is one door", async () => {
  const e = await estate();
  const shared = await addUnit(e, "G1", { bedrooms: 2, maxOccupants: 3 });
  const one = await moveIn(e, shared, "gone");
  const two = await moveIn(e, shared, "gtwo");

  const first = await workspace(one, e.orgId);
  const second = await workspace(two, e.orgId);
  // The limit was always measuring the door and the parking, not the person.
  assert.equal(
    first.allowance!.maxActiveGuests,
    second.allowance!.maxActiveGuests,
  );
  assert.equal(first.allowance!.activeGuests, second.allowance!.activeGuests);
  assert.equal(first.units[0].occupants, 2, "and each sees the flat is shared");
  assert.equal(first.units[0].maxOccupants, 3);
});
