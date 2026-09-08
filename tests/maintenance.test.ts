import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { alerting, rank } from "../lib/server/maintenance";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

interface Home {
  owner: Account;
  orgId: string;
  propertyId: string;
  resident: Account;
}

let counter = 0;

async function home(): Promise<Home> {
  counter += 1;
  const owner = await register(
    {
      email: `manager${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Estate ${counter}`,
      password: pass,
    },
    { ip: `10.2.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Estate ${counter} Court`,
        address: "Cape Town",
        type: "apartment",
      })
    ).id,
  );
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: `B${counter}`,
        rent: 1000,
      })
    ).id,
  );
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: `tenant${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `tenant${counter}@example.test`,
      name: `Tenant ${counter}`,
      password: pass,
    },
    { ip: `10.2.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    resident: (await session(accepted.token))!,
  };
}

test("urgency ranks and alerting levels", () => {
  assert.ok(rank("emergency") < rank("urgent"));
  assert.ok(rank("urgent") < rank("normal"));
  assert.ok(rank("normal") < rank("low"));
  // Anything unrecognised is treated as normal, never as an emergency.
  assert.equal(rank("nonsense"), rank("normal"));
  assert.equal(alerting("emergency"), true);
  assert.equal(alerting("urgent"), true);
  assert.equal(alerting("normal"), false);
  assert.equal(alerting("low"), false);
});

test("residents log complaints and maintenance with an urgency", async (t) => {
  const estate = await home();

  const log = (urgency: string, description: string, category = "Maintenance") =>
    command(estate.resident, estate.orgId, {
      action: "report",
      propertyId: estate.propertyId,
      category,
      urgency,
      description,
    });

  await t.test("an urgency is required and validated", async () => {
    await assert.rejects(
      command(estate.resident, estate.orgId, {
        action: "report",
        propertyId: estate.propertyId,
        category: "Maintenance",
        description: "No urgency given",
      }),
      /urgency/,
    );
    await assert.rejects(log("catastrophic", "made up level"), /urgency/);
  });

  await t.test("the manager's queue is ordered by urgency", async () => {
    await log("low", "Paint scuffed in the hallway");
    await log("emergency", "Burst pipe in the ceiling");
    await log("normal", "Cupboard door loose");
    await log("urgent", "Front door lock broken", "Security");

    const queue = (await workspace(estate.owner, estate.orgId)).reports;
    assert.deepEqual(
      queue.map((r) => r.urgency),
      ["emergency", "urgent", "normal", "low"],
    );
    // The manager needs to know which door to knock on.
    assert.equal(queue[0].unitLabel, `B${counter}`);
    assert.equal(queue[0].authorName, `Tenant ${counter}`);
    assert.equal(queue.filter((r) => alerting(r.urgency)).length, 2);
  });

  await t.test("a resident sees only their own reports", async () => {
    const theirs = await workspace(estate.resident, estate.orgId);
    assert.equal(theirs.reports.length, 4);
    assert.ok(theirs.reports.every((r) => r.authorId === estate.resident.id));
    // And nothing from another estate.
    const other = await home();
    await command(other.resident, other.orgId, {
      action: "report",
      propertyId: other.propertyId,
      category: "Noise",
      urgency: "urgent",
      description: "Party next door",
    });
    assert.equal((await workspace(estate.owner, estate.orgId)).reports.length, 4);
  });

  await t.test("the manager re-triages, the resident cannot", async () => {
    const report = (await workspace(estate.owner, estate.orgId)).reports.find(
      (r) => r.urgency === "low",
    )!;
    await assert.rejects(
      command(estate.resident, estate.orgId, {
        action: "reportUrgency",
        id: report.id,
        urgency: "emergency",
      }),
      /manager account is required/,
    );
    await command(estate.owner, estate.orgId, {
      action: "reportUrgency",
      id: report.id,
      urgency: "urgent",
    });
    const queue = (await workspace(estate.owner, estate.orgId)).reports;
    assert.equal(queue.find((r) => r.id === report.id)!.urgency, "urgent");
    // Re-ranked, so it moves up the queue.
    assert.ok(queue.findIndex((r) => r.id === report.id) < 3);
    assert.equal(queue.filter((r) => alerting(r.urgency)).length, 3);
  });
});

test("the maintenance contacts directory", async (t) => {
  const estate = await home();

  const contact = (over: Record<string, unknown> = {}) => ({
    action: "contractor",
    name: "Sipho Ndlovu",
    trade: "Plumbing",
    company: "Ndlovu Plumbing",
    phone: "+27 82 555 1234",
    email: "sipho@example.test",
    kind: "contractor",
    ...over,
  });

  let contactId = "";

  await t.test("a manager adds a contact", async () => {
    const created = await command(estate.owner, estate.orgId, contact());
    contactId = String(created.id);
    const view = await workspace(estate.owner, estate.orgId);
    assert.equal(view.contractors.length, 1);
    assert.equal(view.contractors[0].name, "Sipho Ndlovu");
    assert.equal(view.contractors[0].trade, "Plumbing");
    assert.equal(view.contractors[0].kind, "contractor");
    assert.equal(view.contractors[0].company, "Ndlovu Plumbing");
  });

  await t.test("in-house staff need no company or email", async () => {
    await command(
      estate.owner,
      estate.orgId,
      contact({
        name: "Anna Mokoena",
        trade: "Gardening",
        kind: "in_house",
        company: "",
        email: "",
        phone: "0825551111",
      }),
    );
    const view = await workspace(estate.owner, estate.orgId);
    const anna = view.contractors.find((c) => c.name === "Anna Mokoena")!;
    assert.equal(anna.kind, "in_house");
    assert.equal(anna.company, null);
    assert.equal(anna.email, null);
    // Sorted by name.
    assert.deepEqual(
      view.contractors.map((c) => c.name),
      ["Anna Mokoena", "Sipho Ndlovu"],
    );
  });

  await t.test("bad details are refused", async () => {
    await assert.rejects(
      command(estate.owner, estate.orgId, contact({ trade: "Astrology" })),
      /valid trade/,
    );
    await assert.rejects(
      command(estate.owner, estate.orgId, contact({ phone: "123" })),
      /valid phone/,
    );
    await assert.rejects(
      command(estate.owner, estate.orgId, contact({ email: "not-an-email" })),
      /valid email/,
    );
  });

  await t.test("residents can neither see nor change the directory", async () => {
    assert.equal(
      (await workspace(estate.resident, estate.orgId)).contractors.length,
      0,
    );
    await assert.rejects(
      command(estate.resident, estate.orgId, contact({ name: "Sneaky" })),
      /manager account is required/,
    );
    await assert.rejects(
      command(estate.resident, estate.orgId, {
        action: "contractorRemove",
        id: contactId,
      }),
      /manager account is required/,
    );
  });

  await t.test("another organisation cannot touch it", async () => {
    const other = await home();
    await assert.rejects(
      command(other.owner, other.orgId, {
        action: "contractorRemove",
        id: contactId,
      }),
      /Contact not found/,
    );
    assert.equal(
      (await workspace(other.owner, other.orgId)).contractors.length,
      0,
    );
  });

  await t.test("a manager edits and removes a contact", async () => {
    await command(estate.owner, estate.orgId, {
      ...contact({ trade: "Electrical", phone: "+27 82 555 9999" }),
      action: "contractorUpdate",
      id: contactId,
    });
    let view = await workspace(estate.owner, estate.orgId);
    const updated = view.contractors.find((c) => c.id === contactId)!;
    assert.equal(updated.trade, "Electrical");
    assert.equal(updated.phone, "+27 82 555 9999");

    await command(estate.owner, estate.orgId, {
      action: "contractorRemove",
      id: contactId,
    });
    view = await workspace(estate.owner, estate.orgId);
    assert.equal(view.contractors.length, 1);
    assert.equal(view.contractors[0].name, "Anna Mokoena");
  });
});
