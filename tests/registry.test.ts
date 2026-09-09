import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { readFile } from "node:fs/promises";
import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { financeExport } from "../lib/server/books";
import { store } from "../lib/server/store";
import type {
  PropertyRecord,
  UnitRecord,
  VisitorRecord,
} from "../lib/server/store";
import { currentPeriod } from "../lib/shared/money";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const sast = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(),
  );

interface Estate {
  owner: Account;
  orgId: string;
  propertyId: string;
  unitId: string;
}

let counter = 0;

/** A manager with one property and one empty unit at R5 000. */
async function estate(): Promise<Estate> {
  counter += 1;
  const owner = await register(
    {
      email: `reg-manager${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Registry Estate ${counter}`,
      password: pass,
    },
    { ip: `10.13.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Registry Court ${counter}`,
        address: "Bloemfontein",
        type: "apartment",
      })
    ).id,
  );
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: `R${counter}`,
        rent: 5000,
      })
    ).id,
  );
  return { owner: owner.user, orgId: owner.orgId, propertyId, unitId };
}

/** Puts a resident into a unit and returns their account. */
async function moveIn(e: Estate, unitId = e.unitId): Promise<Account> {
  counter += 1;
  const email = `reg-tenant${counter}@example.test`;
  const invitation = await command(e.owner, e.orgId, {
    action: "invite",
    email,
    role: "tenant",
    propertyId: e.propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email,
      name: `Resident ${counter}`,
      password: pass,
    },
    { ip: `10.13.0.${counter}` },
  );
  return (await session(accepted.token))!;
}

test("a unit can be repriced and relabelled", async (t) => {
  const e = await estate();

  await t.test(
    "rent changes without disturbing what was received",
    async () => {
      const resident = await moveIn(e);
      await command(e.owner, e.orgId, {
        action: "rent",
        unitId: e.unitId,
        paid: true,
      });
      await command(e.owner, e.orgId, {
        action: "unitUpdate",
        id: e.unitId,
        label: "R-1A",
        rent: 6000,
      });
      const unit = await store().get<UnitRecord>("units", e.unitId);
      assert.equal(unit!.rentCents, 600000);
      assert.equal(unit!.label, "R-1A");
      // The receipt records what was actually paid, at the price that applied.
      const state = await workspace(e.owner, e.orgId);
      const receipt = state.ledger.find((entry) => entry.category === "rent")!;
      assert.equal(receipt.amountCents, 500000);
      // The tenancy is untouched.
      assert.equal(unit!.residentId, resident.id);
    },
  );

  await t.test("the old label is free and the new one is taken", async () => {
    assert.equal(
      await store().get("reservations", `unit:${e.propertyId}:r${counter - 1}`),
      undefined,
    );
    assert.ok(await store().get("reservations", `unit:${e.propertyId}:r-1a`));
    // A second unit cannot take the name this one now holds.
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "R-1A",
        rent: 100,
      }),
      /already exists/i,
    );
  });

  await t.test(
    "an upcoming pass follows the unit to its new name",
    async () => {
      const other = await estate();
      const resident = await moveIn(other);
      await command(resident, other.orgId, {
        action: "visitor",
        propertyId: other.propertyId,
        visitorName: "Lebo Ndlovu",
        phone: "0824419087",
        idType: "passport",
        idNumber: "A1234567",
        visitType: "daily",
        visitDate: sast(),
        arrival: "09:00",
        departure: "18:00",
        password: pass,
      });
      await command(other.owner, other.orgId, {
        action: "unitUpdate",
        id: other.unitId,
        label: "Cottage 4",
        rent: 5000,
      });
      // A guard reading the pass must be sent to the door that exists now.
      const visits = await store().find<VisitorRecord>("visitors", {
        where: [["unitId", "==", other.unitId]],
      });
      assert.equal(visits[0].unitLabel, "Cottage 4");
    },
  );

  await t.test("a resident cannot reprice their own unit", async () => {
    const resident = await moveIn(await estate());
    await assert.rejects(
      command(resident, e.orgId, {
        action: "unitUpdate",
        id: e.unitId,
        label: "Free",
        rent: 0,
      }),
      /do not have access|manager account is required/i,
    );
  });
});

test("archiving is reversible and never loses anything", async (t) => {
  const e = await estate();

  await t.test("an occupied unit is refused", async () => {
    await moveIn(e);
    await assert.rejects(
      command(e.owner, e.orgId, { action: "unitArchive", id: e.unitId }),
      /still lives in/i,
    );
  });

  await t.test("an empty one is archived and stops being vacancy", async () => {
    const state = await workspace(e.owner, e.orgId);
    const resident = state.members.find((m) => m.role === "tenant")!;
    await command(e.owner, e.orgId, {
      action: "removeMember",
      id: resident.id,
    });
    await command(e.owner, e.orgId, { action: "unitArchive", id: e.unitId });
    const unit = await store().get<UnitRecord>("units", e.unitId);
    assert.ok(unit, "the unit still exists");
    assert.ok(unit!.archivedAt);
    // Out of the books: it earns nothing, owes nothing, and is not vacancy.
    const { csv } = await financeExport(e.owner, e.orgId, currentPeriod());
    assert.ok(!csv.includes(unit!.label));
    assert.ok(csv.includes('"Vacancy (0 empty)","0.00"'));
  });

  await t.test("it is not offered when enrolling a resident", async () => {
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "invite",
        email: "nobody@example.test",
        role: "tenant",
        propertyId: e.propertyId,
        unitId: e.unitId,
      }),
      /vacant unit/i,
    );
  });

  await t.test("and it stops using up a paid unit slot", async () => {
    // Starter allows 25 units. Fill to the limit with the archived one still
    // present: if archived units counted, this would be refused one short.
    const filler = await estate();
    for (let i = 0; i < 24; i += 1)
      await command(filler.owner, filler.orgId, {
        action: "unit",
        propertyId: filler.propertyId,
        label: `F${i}`,
        rent: 100,
      });
    await command(filler.owner, filler.orgId, {
      action: "unitArchive",
      id: filler.unitId,
    });
    // 25 live units would be the cap; one is archived, so one more fits.
    await command(filler.owner, filler.orgId, {
      action: "unit",
      propertyId: filler.propertyId,
      label: "F24",
      rent: 100,
    });
    await assert.rejects(
      command(filler.owner, filler.orgId, {
        action: "unit",
        propertyId: filler.propertyId,
        label: "F25",
        rent: 100,
      }),
      /unit limit/i,
    );
  });

  await t.test("restoring brings it back in use", async () => {
    await command(e.owner, e.orgId, {
      action: "unitArchive",
      id: e.unitId,
      archived: false,
    });
    const unit = await store().get<UnitRecord>("units", e.unitId);
    assert.equal(unit!.archivedAt, null);
    // It counts as vacancy again, because it is again a unit that could earn.
    const { csv } = await financeExport(e.owner, e.orgId, currentPeriod());
    assert.ok(csv.includes('"Vacancy (1 empty)","5000.00"'));
  });
});

test("a property is archived with its empty units, never with its residents", async (t) => {
  const e = await estate();
  const second = String(
    (
      await command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "Second",
        rent: 3000,
      })
    ).id,
  );

  await t.test("a building with residents in it is refused", async () => {
    await moveIn(e);
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "propertyArchive",
        id: e.propertyId,
      }),
      /still occupied/i,
    );
  });

  await t.test("emptied, it archives and takes its units with it", async () => {
    const state = await workspace(e.owner, e.orgId);
    const resident = state.members.find((m) => m.role === "tenant")!;
    await command(e.owner, e.orgId, {
      action: "removeMember",
      id: resident.id,
    });
    await command(e.owner, e.orgId, {
      action: "propertyArchive",
      id: e.propertyId,
    });
    const property = await store().get<PropertyRecord>(
      "properties",
      e.propertyId,
    );
    assert.ok(property!.archivedAt);
    for (const id of [e.unitId, second]) {
      const unit = await store().get<UnitRecord>("units", id);
      assert.ok(unit!.archivedAt, `${id} went with the building`);
    }
  });

  await t.test("nothing new can be added to it", async () => {
    for (const input of [
      { action: "unit", propertyId: e.propertyId, label: "Late", rent: 100 },
      {
        action: "invite",
        email: "late@example.test",
        role: "tenant",
        propertyId: e.propertyId,
        unitId: second,
      },
    ])
      await assert.rejects(command(e.owner, e.orgId, input), /archived/i);
  });

  await t.test("but its history still reads", async () => {
    const state = await workspace(e.owner, e.orgId);
    // Still sent, so a visitor row or a report can still name the building.
    const property = state.properties.find((p) => p.id === e.propertyId);
    assert.ok(property, "the archived property is still in the read model");
    assert.ok(property.archivedAt);
    // Named, so a visitor row or a report from before the archive still says
    // which building it happened at.
    const stored = await store().get<PropertyRecord>(
      "properties",
      e.propertyId,
    );
    assert.equal(property.name, stored!.name);
    assert.ok(property.name.length > 0);
    // The units are still sent too, for the same reason.
    assert.ok(state.units.some((u) => u.id === e.unitId && u.archivedAt));
  });

  await t.test("restoring brings the building and its units back", async () => {
    await command(e.owner, e.orgId, {
      action: "propertyArchive",
      id: e.propertyId,
      archived: false,
    });
    const property = await store().get<PropertyRecord>(
      "properties",
      e.propertyId,
    );
    assert.equal(property!.archivedAt, null);
    for (const id of [e.unitId, second]) {
      const unit = await store().get<UnitRecord>("units", id);
      assert.equal(unit!.archivedAt, null);
    }
    // And it accepts new records again.
    await command(e.owner, e.orgId, {
      action: "unit",
      propertyId: e.propertyId,
      label: "Third",
      rent: 100,
    });
  });
});

test("a property can be renamed and retyped", async (t) => {
  const e = await estate();

  await t.test("the details change and the login code does not", async () => {
    const before = await store().get<PropertyRecord>(
      "properties",
      e.propertyId,
    );
    await command(e.owner, e.orgId, {
      action: "propertyUpdate",
      id: e.propertyId,
      name: "Renamed Residence",
      address: "9 New Street, Durban",
      type: "student_accommodation",
    });
    const after = await store().get<PropertyRecord>("properties", e.propertyId);
    assert.equal(after!.name, "Renamed Residence");
    assert.equal(after!.address, "9 New Street, Durban");
    assert.equal(after!.type, "student_accommodation");
    // Residents sign in with the property code, so it must not move.
    assert.equal(after!.loginCode, before!.loginCode);
    // The visitor limits a manager set are not reset by an edit.
    assert.equal(after!.maxActiveGuests, before!.maxActiveGuests);
  });

  await t.test("the old name is released and the new one held", async () => {
    assert.ok(
      await store().get(
        "reservations",
        `property:${e.orgId}:renamed residence`,
      ),
    );
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "property",
        name: "Renamed Residence",
        address: "Somewhere",
        type: "apartment",
      }),
      /already exists/i,
    );
    // And the name it used to have is free for a new building.
    await command(e.owner, e.orgId, {
      action: "property",
      name: `Registry Court ${counter}`,
      address: "Elsewhere",
      type: "apartment",
    });
  });

  await t.test("another organisation cannot touch it", async () => {
    const other = await estate();
    await assert.rejects(
      command(other.owner, other.orgId, {
        action: "propertyUpdate",
        id: e.propertyId,
        name: "Hijacked",
        address: "Nowhere",
        type: "apartment",
      }),
      /not available/i,
    );
    await assert.rejects(
      command(other.owner, other.orgId, {
        action: "unitArchive",
        id: e.unitId,
      }),
      /not found|not available/i,
    );
  });
});

test("the dialogs post the action names the server answers to", async () => {
  // The workspace posts its modal id straight through as the action, so a
  // modal named anything else fails with "Unknown action." at the moment a
  // manager presses Save — invisible to a test that calls command() directly,
  // which is exactly how the edit dialogs shipped broken once.
  const source = await readFile(
    new URL("../components/workspace/WorkspaceApp.tsx", import.meta.url),
    "utf8",
  );
  const modals = [
    ...source.matchAll(/modal === "([a-zA-Z]+)"/g),
    ...source.matchAll(/open\("([a-zA-Z]+)"/g),
  ].map((match) => match[1]);
  assert.ok(modals.length > 8, "found the dialogs to check");
  // The guard has to fail on a bad name, or it guards nothing.
  await assert.rejects(
    (async () => {
      const e = await estate();
      await command(e.owner, e.orgId, { action: "propertyEdit" });
    })(),
    /unknown action/i,
  );

  const e = await estate();
  for (const action of [...new Set(modals)]) {
    // Reaching any other error means the action is known; only this message
    // means the server has never heard of it.
    await assert.doesNotReject(
      command(e.owner, e.orgId, { action })
        .then(() => undefined)
        .catch((error: Error) => {
          if (/unknown action/i.test(error.message)) throw error;
        }),
      `the dialog "${action}" posts an action the server does not answer to`,
    );
  }
});

test("restoring a property respects the plan and leaves hand-archived units alone", async (t) => {
  const e = await estate();
  const spare = String(
    (
      await command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "Spare",
        rent: 1000,
      })
    ).id,
  );

  await t.test(
    "a unit archived on its own does not come back with it",
    async () => {
      // Two separate decisions: this one was taken about the unit, not about
      // the building, so restoring the building must not undo it.
      await command(e.owner, e.orgId, { action: "unitArchive", id: spare });
      await command(e.owner, e.orgId, {
        action: "propertyArchive",
        id: e.propertyId,
      });
      await command(e.owner, e.orgId, {
        action: "propertyArchive",
        id: e.propertyId,
        archived: false,
      });
      const restored = await store().get<UnitRecord>("units", e.unitId);
      const separate = await store().get<UnitRecord>("units", spare);
      assert.equal(restored!.archivedAt, null, "the building's unit came back");
      assert.ok(separate!.archivedAt, "the hand-archived one stayed archived");
      // Which unit follows the building is recorded, not inferred from the
      // two sharing a timestamp: archivings a millisecond apart collide, and a
      // unit filed away on its own would quietly come back with the building.
      assert.equal(separate!.archivedWithProperty, 0);
      assert.equal(restored!.archivedWithProperty, 0);
    },
  );

  await t.test("a restore that would breach the plan is refused", async () => {
    // Fill to the Starter cap, archive the building, then fill the freed
    // space. Restoring would now put the organisation over its limit.
    for (let i = 0; i < 23; i += 1)
      await command(e.owner, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: `P${i}`,
        rent: 100,
      });
    await command(e.owner, e.orgId, {
      action: "propertyArchive",
      id: e.propertyId,
    });
    const second = String(
      (
        await command(e.owner, e.orgId, {
          action: "property",
          name: `Overflow ${counter}`,
          address: "Somewhere",
          type: "apartment",
        })
      ).id,
    );
    for (let i = 0; i < 25; i += 1)
      await command(e.owner, e.orgId, {
        action: "unit",
        propertyId: second,
        label: `O${i}`,
        rent: 100,
      });
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "propertyArchive",
        id: e.propertyId,
        archived: false,
      }),
      /past your plan's limit/i,
    );
    // And nothing moved: a refused restore leaves the building archived.
    const property = await store().get<PropertyRecord>(
      "properties",
      e.propertyId,
    );
    assert.ok(property!.archivedAt);
  });
});
