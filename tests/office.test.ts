import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { fileDocument, openDocument } from "../lib/server/filing";
import {
  useDocumentStorage,
  type DocumentStorage,
} from "../lib/server/documents";
import { sastToday } from "../lib/server/visits";
import { store } from "../lib/server/store";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

/** Documents in memory, so the suite never touches a disk or a bucket. */
function memoryStorage(): DocumentStorage & { size(): number } {
  const files = new Map<string, Uint8Array>();
  return {
    name: "memory",
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      return files.get(key);
    },
    async remove(key) {
      files.delete(key);
    },
    size: () => files.size,
  };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const later = (days: number) =>
  new Date(Date.parse(`${sastToday()}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

interface Estate {
  owner: Account;
  orgId: string;
  propertyId: string;
  otherPropertyId: string;
  unitId: string;
  resident: Account;
  reception: Account;
}

let counter = 0;

/**
 * A manager with two buildings, a resident in one of them, and a reception
 * desk assigned to that same building.
 */
async function estate(): Promise<Estate> {
  counter += 1;
  const tag = `office${counter}`;
  const owner = await register(
    {
      email: `${tag}-owner@example.test`,
      name: "Nomsa Manager",
      organisation: `Office Estate ${counter}`,
      password: pass,
    },
    { ip: `10.5.0.${counter}` },
  );
  const property = async (name: string) =>
    String(
      (
        await command(owner.user, owner.orgId, {
          action: "property",
          name,
          address: "Cape Town",
          type: "apartment",
        })
      ).id,
    );
  // Starter sells one office sign-in and the owner holds it, so an estate with
  // a reception desk in it is by definition on a bigger plan.
  await store().tx(async (tx) => {
    tx.update("organisations", owner.orgId, { plan: "growth" });
  });
  const propertyId = await property(`Court ${counter}`);
  const otherPropertyId = await property(`Annex ${counter}`);
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: "A1",
        rent: 1000,
      })
    ).id,
  );

  const accept = async (
    role: string,
    email: string,
    name: string,
    extra: Record<string, unknown> = {},
  ) => {
    const invitation = await command(owner.user, owner.orgId, {
      action: "invite",
      email,
      role,
      propertyId,
      ...extra,
    });
    const accepted = await join(
      { token: invitation.token, email, name, password: pass },
      { ip: `10.5.0.${counter}` },
    );
    return (await session(accepted.token))!;
  };

  const resident = await accept(
    "tenant",
    `${tag}-resident@example.test`,
    "Aisha Resident",
    { unitId },
  );
  const reception = await accept(
    "reception",
    `${tag}-reception@example.test`,
    "Fatima Desk",
  );

  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    otherPropertyId,
    unitId,
    resident,
    reception,
  };
}

/* ------------------------------------------------------------------ */
/* Occupancy history                                                   */
/* ------------------------------------------------------------------ */

test("a stay is recorded when a resident moves in, and kept when they go", async (t) => {
  const e = await estate();

  await t.test("moving in opens a tenancy", async () => {
    const live = await workspace(e.owner, e.orgId);
    const stay = live.tenancies.find((s) => s.unitId === e.unitId);
    assert.ok(stay, "the register knows who is in A1");
    assert.equal(stay!.residentName, "Aisha Resident");
    assert.equal(stay!.current, true);
    assert.equal(stay!.endedAt, null);
    assert.equal(stay!.unitLabel, "A1");
  });

  await t.test("removing the resident closes it rather than deleting it", async () => {
    await command(e.owner, e.orgId, {
      action: "removeMember",
      id: e.resident.id,
    });
    const live = await workspace(e.owner, e.orgId);
    const stay = live.tenancies.find((s) => s.unitId === e.unitId);
    // The membership is gone; the history is not. This is the whole point:
    // otherwise a lease belongs to nobody the day its tenant leaves.
    assert.ok(stay, "the stay survives the account");
    assert.equal(stay!.current, false);
    assert.ok(stay!.endedAt, "it has an end date");
    assert.equal(stay!.residentName, "Aisha Resident");
    assert.equal(
      live.members.some((m) => m.id === e.resident.id),
      false,
      "while the membership really is gone",
    );
  });

  await t.test("the unit can be let again, and both stays are kept", async () => {
    const invitation = await command(e.owner, e.orgId, {
      action: "invite",
      email: `office${counter}-next@example.test`,
      role: "tenant",
      propertyId: e.propertyId,
      unitId: e.unitId,
    });
    await join(
      {
        token: invitation.token,
        email: `office${counter}-next@example.test`,
        name: "Thabo Next",
        password: pass,
      },
      { ip: "10.5.0.99" },
    );
    const live = await workspace(e.owner, e.orgId);
    const stays = live.tenancies.filter((s) => s.unitId === e.unitId);
    assert.equal(stays.length, 2, "previous and current occupant");
    assert.equal(stays.filter((s) => s.current).length, 1, "only one current");
    assert.deepEqual(
      stays.map((s) => s.residentName).sort(),
      ["Aisha Resident", "Thabo Next"],
      "searching the unit finds both",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Reception                                                           */
/* ------------------------------------------------------------------ */

test("reception runs its building and never the money", async (t) => {
  const e = await estate();

  await t.test("it sees its own property, and not the other one", async () => {
    const live = await workspace(e.reception, e.orgId);
    assert.deepEqual(
      live.properties.map((p) => p.id),
      [e.propertyId],
    );
    assert.equal(live.membership.role, "reception");
  });

  await t.test("the books and the subscription never reach it", async () => {
    const live = await workspace(e.reception, e.orgId);
    assert.deepEqual(live.ledger, [], "no books");
    assert.deepEqual(live.invoices, [], "no invoices");
  });

  await t.test("and it cannot write to them either", async () => {
    for (const input of [
      {
        action: "ledgerEntry",
        kind: "expense",
        category: "utilities",
        nature: "variable",
        amount: 100,
        description: "Not mine",
        period: sastToday().slice(0, 7),
      },
      { action: "rent", id: e.unitId, paid: true },
    ])
      await assert.rejects(
        command(e.reception, e.orgId, input),
        /manager account is required/,
        `refused: ${input.action}`,
      );
  });

  await t.test("it does run the building's day to day", async () => {
    await assert.doesNotReject(
      command(e.reception, e.orgId, {
        action: "unit",
        propertyId: e.propertyId,
        label: "A2",
        rent: 900,
      }),
    );
    await assert.doesNotReject(
      command(e.reception, e.orgId, {
        action: "contractor",
        name: "Piet Plumber",
        trade: "Plumbing",
        phone: "0821234567",
        kind: "contractor",
      }),
    );
  });

  await t.test("it cannot reach into the other building", async () => {
    await assert.rejects(
      command(e.reception, e.orgId, {
        action: "unit",
        propertyId: e.otherPropertyId,
        label: "Z9",
        rent: 900,
      }),
      /not available/i,
    );
  });

  await t.test("it cannot mint office accounts", async () => {
    for (const role of ["manager", "reception"])
      await assert.rejects(
        command(e.reception, e.orgId, {
          action: "invite",
          email: `climb-${role}@example.test`,
          role,
          propertyId: e.propertyId,
        }),
        /only a manager can create/i,
        `refused inviting a ${role}`,
      );
  });

  await t.test("nor remove the manager who made it", async () => {
    await assert.rejects(
      command(e.reception, e.orgId, {
        action: "removeMember",
        id: e.owner.id,
      }),
      /only a manager can remove/i,
    );
  });

  await t.test("but it may still enrol residents and security", async () => {
    await assert.doesNotReject(
      command(e.reception, e.orgId, {
        action: "invite",
        email: `guard-${counter}@example.test`,
        role: "security",
        propertyId: e.propertyId,
      }),
    );
  });
});

test("a reception account spends a manager seat", async () => {
  // A fresh organisation is on Starter: one office sign-in, already held by
  // the owner. If reception were free, this invitation would succeed and the
  // plan limit would be a formality - invite reception instead of managers and
  // never upgrade.
  counter += 1;
  const owner = await register(
    {
      email: `seat${counter}@example.test`,
      name: "Solo Manager",
      organisation: `Solo Estate ${counter}`,
      password: pass,
    },
    { ip: "10.6.0.1" },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Solo Court ${counter}`,
        address: "Durban",
        type: "apartment",
      })
    ).id,
  );
  for (const role of ["reception", "manager"])
    await assert.rejects(
      command(owner.user, owner.orgId, {
        action: "invite",
        email: `seat-${role}-${counter}@example.test`,
        role,
        propertyId,
      }),
      /manager or reception sign-in/,
      `${role} spends the same seat`,
    );
  // Security and residents are uncapped, and stay that way.
  await assert.doesNotReject(
    command(owner.user, owner.orgId, {
      action: "invite",
      email: `seat-guard-${counter}@example.test`,
      role: "security",
      propertyId,
    }),
  );
});

/* ------------------------------------------------------------------ */
/* Resident notices                                                    */
/* ------------------------------------------------------------------ */

test("a resident gives notice and the office answers it", async (t) => {
  const e = await estate();
  let noticeId = "";

  await t.test("only the resident may raise one", async () => {
    for (const who of [e.owner, e.reception])
      await assert.rejects(
        command(who, e.orgId, {
          action: "notice",
          kind: "move_out",
          effectiveDate: later(30),
          details: "On their behalf",
        }),
        /only a resident can give notice/i,
      );
  });

  await t.test("the resident raises it", async () => {
    const created = await command(e.resident, e.orgId, {
      action: "notice",
      kind: "move_out",
      effectiveDate: later(30),
      details: "Taking a job in Gqeberha.",
    });
    noticeId = String(created.id);
    const live = await workspace(e.resident, e.orgId);
    const notice = live.requests.find((r) => r.id === noticeId)!;
    assert.equal(notice.status, "open");
    assert.equal(notice.kind, "move_out");
    assert.equal(notice.unitLabel, "A1");
  });

  await t.test("it reaches the manager and the reception desk", async () => {
    for (const who of [e.owner, e.reception]) {
      const live = await workspace(who, e.orgId);
      assert.ok(
        live.requests.some((r) => r.id === noticeId),
        "the office sees it",
      );
    }
  });

  await t.test("reception answers it", async () => {
    await command(e.reception, e.orgId, {
      action: "noticeStatus",
      id: noticeId,
      status: "approved",
      note: "Exit inspection booked for the 28th.",
    });
    const live = await workspace(e.resident, e.orgId);
    const notice = live.requests.find((r) => r.id === noticeId)!;
    assert.equal(notice.status, "approved");
    assert.equal(notice.decidedByName, "Fatima Desk");
    assert.match(notice.decisionNote, /28th/);
  });

  await t.test("an answered notice can no longer be withdrawn", async () => {
    await assert.rejects(
      command(e.resident, e.orgId, {
        action: "noticeWithdraw",
        id: noticeId,
      }),
      /already been answered/i,
    );
  });

  await t.test("a resident may withdraw one still waiting", async () => {
    const created = await command(e.resident, e.orgId, {
      action: "notice",
      kind: "unit_change",
      effectiveDate: later(60),
      details: "Actually, never mind.",
    });
    await command(e.resident, e.orgId, {
      action: "noticeWithdraw",
      id: String(created.id),
    });
    const live = await workspace(e.resident, e.orgId);
    assert.equal(
      live.requests.find((r) => r.id === created.id)!.status,
      "withdrawn",
    );
    // And the office cannot undo the resident's own withdrawal.
    await assert.rejects(
      command(e.owner, e.orgId, {
        action: "noticeStatus",
        id: String(created.id),
        status: "approved",
      }),
      /stays withdrawn/i,
    );
  });

  await t.test("one resident never sees another's notice", async () => {
    const other = await estate();
    const live = await workspace(other.resident, other.orgId);
    assert.equal(
      live.requests.some((r) => r.id === noticeId),
      false,
    );
  });
});

/* ------------------------------------------------------------------ */
/* The filing cabinet                                                  */
/* ------------------------------------------------------------------ */

test("documents are filed against a stay and guarded by membership", async (t) => {
  const files = memoryStorage();
  useDocumentStorage(files);
  t.after(() => useDocumentStorage(undefined));

  const e = await estate();
  const live = await workspace(e.owner, e.orgId);
  const tenancyId = live.tenancies.find((s) => s.unitId === e.unitId)!.id;
  let documentId = "";

  await t.test("reception files a lease", async () => {
    const filed = await fileDocument(e.reception, {
      orgId: e.orgId,
      tenancyId,
      title: "Lease agreement",
      kind: "lease",
      filename: "lease.pdf",
      mime: "application/pdf",
      data: PDF,
    });
    documentId = filed.id;
    const after = await workspace(e.owner, e.orgId);
    const document = after.documents.find((d) => d.id === documentId)!;
    assert.equal(document.title, "Lease agreement");
    assert.equal(document.unitLabel, "A1");
    assert.equal(document.residentName, "Aisha Resident");
    assert.equal(files.size(), 1, "the bytes were stored");
    assert.equal(
      "storageKey" in document,
      false,
      "and where they sit is never sent to a browser",
    );
  });

  await t.test("the office and the resident can open it", async () => {
    for (const who of [e.owner, e.reception, e.resident]) {
      const opened = await openDocument(who, e.orgId, documentId);
      assert.deepEqual(opened.bytes, PDF);
    }
  });

  await t.test("another organisation cannot", async () => {
    const other = await estate();
    await assert.rejects(
      openDocument(other.owner, other.orgId, documentId),
      /not found/i,
      "and is told nothing about whether it exists",
    );
  });

  await t.test("only PDFs and images are accepted", async () => {
    await assert.rejects(
      fileDocument(e.owner, {
        orgId: e.orgId,
        tenancyId,
        title: "A script",
        kind: "other",
        filename: "evil.svg",
        // SVG is an image everywhere else and a script here.
        mime: "image/svg+xml",
        data: PDF,
      }),
      /PDF or an image/i,
    );
  });

  await t.test("a resident cannot file anything", async () => {
    await assert.rejects(
      fileDocument(e.resident, {
        orgId: e.orgId,
        tenancyId,
        title: "Mine",
        kind: "other",
        filename: "mine.pdf",
        mime: "application/pdf",
        data: PDF,
      }),
      /manager or reception account is required/,
    );
  });

  await t.test("the lease outlives the tenant", async () => {
    await command(e.owner, e.orgId, {
      action: "removeMember",
      id: e.resident.id,
    });
    const after = await workspace(e.owner, e.orgId);
    const document = after.documents.find((d) => d.id === documentId);
    assert.ok(document, "still filed after the account is gone");
    assert.equal(document!.residentName, "Aisha Resident");
    const opened = await openDocument(e.owner, e.orgId, documentId);
    assert.deepEqual(opened.bytes, PDF);
  });

  await t.test("removing it takes the file with it", async () => {
    await command(e.owner, e.orgId, {
      action: "documentRemove",
      id: documentId,
    });
    assert.equal(files.size(), 0, "no orphaned bytes left behind");
    await assert.rejects(
      openDocument(e.owner, e.orgId, documentId),
      /not found/i,
    );
  });
});

test("security is shown no paperwork at all", async () => {
  const files = memoryStorage();
  useDocumentStorage(files);
  try {
    const e = await estate();
    const invitation = await command(e.owner, e.orgId, {
      action: "invite",
      email: `sec-only-${counter}@example.test`,
      role: "security",
      propertyId: e.propertyId,
    });
    const accepted = await join(
      {
        token: invitation.token,
        email: `sec-only-${counter}@example.test`,
        name: "Sibusiso Guard",
        password: pass,
      },
      { ip: "10.5.0.77" },
    );
    const guard = (await session(accepted.token))!;
    const live = await workspace(guard, e.orgId);
    // Nothing at the gate is answered by a lease, a tenancy or a notice.
    assert.deepEqual(live.documents, []);
    assert.deepEqual(live.tenancies, []);
    assert.deepEqual(live.requests, []);
  } finally {
    useDocumentStorage(undefined);
  }
});
