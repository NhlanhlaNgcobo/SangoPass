import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { commandAndNotify } from "../lib/server/notifications";
import { store } from "../lib/server/store";
import type { VisitorRecord } from "../lib/server/store";
import {
  maskIdNumber,
  sastToday,
  validPassport,
  validSaId,
} from "../lib/server/visits";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";
const VALID_ID = "8001015009087";

/** The first of next month: always future, always a whole month of room. */
function baseDate() {
  const today = sastToday();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function plusDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

interface Fixture {
  owner: Account;
  orgId: string;
  propertyId: string;
  unitId: string;
  resident: Account;
}

let counter = 0;

async function fixture(
  type: "apartment" | "student_accommodation" = "apartment",
): Promise<Fixture> {
  counter += 1;
  const owner = await register(
    {
      email: `owner${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Residences ${counter}`,
      password: pass,
    },
    { ip: `10.1.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Court ${counter}`,
        address: "Cape Town",
        type,
      })
    ).id,
  );
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: `U${counter}`,
        rent: 1000,
      })
    ).id,
  );
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: `resident${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
    studentNumber: `2000${counter}`,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `resident${counter}@example.test`,
      name: `Resident ${counter}`,
      password: pass,
    },
    { ip: `10.1.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    unitId,
    resident: (await session(accepted.token))!,
  };
}

const guest = (over: Record<string, unknown> = {}) => ({
  action: "visitor",
  // Every guest request re-authenticates the resident.
  password: pass,
  visitorName: "Lebo Dlamini",
  phone: "+27 82 123 4567",
  idType: "sa_id",
  idNumber: VALID_ID,
  visitType: "daily",
  visitDate: baseDate(),
  arrival: "09:00",
  departure: "18:00",
  ...over,
});

/* ------------------------------------------------------------------ */

test("South African ID numbers are checked, not merely counted", () => {
  assert.equal(validSaId(VALID_ID), true);
  // Last digit is the Luhn check: changing it must fail.
  assert.equal(validSaId("8001015009088"), false);
  assert.equal(validSaId("8013015009087"), false, "month 13");
  assert.equal(validSaId("8001325009087"), false, "day 32");
  assert.equal(validSaId("800101500908"), false, "twelve digits");
  assert.equal(validSaId("80010150090870"), false, "fourteen digits");
  assert.equal(validSaId("abcdefghijklm"), false);

  assert.equal(validPassport("A1234567"), true);
  assert.equal(validPassport("AB12"), false);
  assert.equal(validPassport("A123456!"), false);

  assert.equal(maskIdNumber(VALID_ID), "•••••••••9087");
  assert.equal(maskIdNumber("123"), "••••");
});

test("only a resident may request a guest visit", async (t) => {
  const home = await fixture();

  await t.test("a manager cannot book a guest", async () => {
    await assert.rejects(
      command(home.owner, home.orgId, guest({ propertyId: home.propertyId })),
      /Only a resident/,
    );
  });

  await t.test("security cannot book a guest", async () => {
    const invitation = await command(home.owner, home.orgId, {
      action: "invite",
      email: "guard-visits@example.test",
      role: "security",
      propertyId: home.propertyId,
    });
    const accepted = await join({
      token: invitation.token,
      email: "guard-visits@example.test",
      name: "Guard",
      password: pass,
    });
    await assert.rejects(
      command((await session(accepted.token))!, home.orgId,
        guest({ propertyId: home.propertyId }),
      ),
      /Only a resident/,
    );
  });

  await t.test("the resident can", async () => {
    const created = await command(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId }),
    );
    assert.ok(created.token);
    assert.match(String(created.reference), /^SP-[A-F0-9]{10}$/);
  });
});

test("the visitor's own identity document is required", async (t) => {
  const flat = await fixture("apartment");
  const residence = await fixture("student_accommodation");

  await t.test("an apartment demands an ID or a passport", async () => {
    await assert.rejects(
      command(
        flat.resident,
        flat.orgId,
        guest({ propertyId: flat.propertyId, idType: "student_number", idNumber: "20001" }),
      ),
      /valid visitor identity type/,
    );
    await assert.rejects(
      command(
        flat.resident,
        flat.orgId,
        guest({ propertyId: flat.propertyId, idNumber: "8001015009088" }),
      ),
      /checksum/,
    );
    const withPassport = await command(
      flat.resident,
      flat.orgId,
      guest({
        propertyId: flat.propertyId,
        idType: "passport",
        idNumber: "a123456",
      }),
    );
    const stored = await store().get<VisitorRecord>(
      "visitors",
      String(withPassport.id),
    );
    // Normalised for comparison at the gate.
    assert.equal(stored!.idNumber, "A123456");
    assert.equal(stored!.idType, "passport");
  });

  await t.test(
    "a student residence also accepts a student number",
    async () => {
      const created = await command(
        residence.resident,
        residence.orgId,
        guest({
          propertyId: residence.propertyId,
          idType: "student_number",
          idNumber: "00123456",
        }),
      );
      const stored = await store().get<VisitorRecord>(
        "visitors",
        String(created.id),
      );
      assert.equal(stored!.idNumber, "00123456", "leading zeroes survive");
    },
  );

  await t.test("the identity number is masked in the workspace", async () => {
    const view = await workspace(flat.resident, flat.orgId);
    const visit = view.visitors.find((v) => v.idType === "passport")!;
    assert.equal(visit.idNumber, "••••3456", "only the last four survive");
    assert.ok(
      !JSON.stringify(view).includes("A123456"),
      "the full document number never reaches the client",
    );
  });
});

test("day visits, sleepovers and extended sleepovers", async (t) => {
  const home = await fixture();
  const from = baseDate();

  await t.test("a day visit must end the day it starts", async () => {
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({
          propertyId: home.propertyId,
          arrival: "20:00",
          departure: "06:00",
        }),
      ),
      /must end after it starts/,
    );
  });

  await t.test("a sleepover crosses one midnight", async () => {
    const created = await command(
      home.resident,
      home.orgId,
      guest({
        propertyId: home.propertyId,
        visitType: "sleepover",
        visitDate: from,
        arrival: "20:00",
        departure: "06:00",
      }),
    );
    const stored = await store().get<VisitorRecord>(
      "visitors",
      String(created.id),
    );
    assert.equal(stored!.nights, 1);
    assert.equal(stored!.endDate, plusDays(from, 1));
    assert.equal(stored!.visitType, "sleepover");
  });

  await t.test("an extended sleepover needs two nights or more", async () => {
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({
          propertyId: home.propertyId,
          visitType: "extended_sleepover",
          nights: 1,
          visitDate: plusDays(from, 10),
        }),
      ),
      /two or more nights/,
    );
    const created = await command(
      home.resident,
      home.orgId,
      guest({
        propertyId: home.propertyId,
        visitType: "extended_sleepover",
        nights: 3,
        visitDate: plusDays(from, 10),
        arrival: "18:00",
        departure: "09:00",
      }),
    );
    const stored = await store().get<VisitorRecord>(
      "visitors",
      String(created.id),
    );
    assert.equal(stored!.nights, 3);
    assert.equal(stored!.endDate, plusDays(from, 13));
  });

  await t.test("a past visit window is refused", async () => {
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({ propertyId: home.propertyId, visitDate: "2020-01-02" }),
      ),
      /not in the past/,
    );
  });
});

test("the property manager sets the visitor limits", async (t) => {
  const home = await fixture();
  const from = baseDate();

  await t.test("a resident cannot change them", async () => {
    await assert.rejects(
      command(home.resident, home.orgId, {
        action: "propertyLimits",
        propertyId: home.propertyId,
        sleepoverNightsPerMonth: 30,
        maxConsecutiveNights: 30,
        maxActiveGuests: 20,
      }),
      /manager account is required/,
    );
  });

  await t.test("the manager can, within bounds", async () => {
    await assert.rejects(
      command(home.owner, home.orgId, {
        action: "propertyLimits",
        propertyId: home.propertyId,
        sleepoverNightsPerMonth: 99,
        maxConsecutiveNights: 3,
        maxActiveGuests: 5,
      }),
      /between 0 and 31/,
    );
    await command(home.owner, home.orgId, {
      action: "propertyLimits",
      propertyId: home.propertyId,
      sleepoverNightsPerMonth: 8,
      maxConsecutiveNights: 3,
      maxActiveGuests: 5,
    });
    const view = await workspace(home.owner, home.orgId);
    assert.equal(view.properties[0].sleepoverNightsPerMonth, 8);
    assert.equal(view.properties[0].maxConsecutiveNights, 3);
  });

  await t.test("a sleepover cannot exceed the consecutive limit", async () => {
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({
          propertyId: home.propertyId,
          visitType: "extended_sleepover",
          nights: 4,
          visitDate: from,
        }),
      ),
      /at most 3 consecutive nights/,
    );
  });

  const book = (day: number, nights: number) =>
    command(
      home.resident,
      home.orgId,
      guest({
        propertyId: home.propertyId,
        visitType: "extended_sleepover",
        nights,
        visitDate: plusDays(from, day),
        arrival: "18:00",
        departure: "09:00",
      }),
    );

  await t.test("the monthly night budget is enforced per unit", async () => {
    await book(0, 3); // 3 of 8
    await book(5, 3); // 6 of 8
    await assert.rejects(book(10, 3), /has used 6 and this request needs 3/);
    await book(10, 2); // 8 of 8
    await assert.rejects(book(15, 2), /has used 8/);

    // A day visit consumes no sleepover nights.
    await command(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId, visitDate: plusDays(from, 20) }),
    );
    await assert.rejects(book(20, 2), /has used 8/);
  });

  await t.test("cancelling a sleepover returns its nights", async () => {
    const booked = (await workspace(home.resident, home.orgId)).visitors.filter(
      (v) => v.nights === 3 && v.status === "upcoming",
    );
    assert.ok(booked.length, "a three-night stay to release");
    await command(home.resident, home.orgId, {
      action: "visitorStatus",
      id: booked[0].id,
      status: "cancelled",
    });
    // 8 used minus the released 3 leaves room for exactly three more.
    const revived = await book(20, 3);
    assert.ok(revived.id);
    await assert.rejects(book(25, 2), /has used 8/);
  });

  await t.test(
    "the allowance panel reports the resident's current month",
    async () => {
      // Enforcement counts against the month a stay begins in; the panel shows
      // where the resident stands today.
      const view = await workspace(home.resident, home.orgId);
      assert.equal(view.allowance!.month, sastToday().slice(0, 7));
      assert.equal(view.allowance!.sleepoverNightsPerMonth, 8);
      assert.equal(view.allowance!.maxConsecutiveNights, 3);
      assert.ok(view.allowance!.activeGuests > 0);
      // Managers and security host nobody, so they get no allowance.
      assert.equal((await workspace(home.owner, home.orgId)).allowance, null);
    },
  );
});

test("a unit may only hold so many guest passes at once", async (t) => {
  const home = await fixture();
  const from = baseDate();
  await command(home.owner, home.orgId, {
    action: "propertyLimits",
    propertyId: home.propertyId,
    sleepoverNightsPerMonth: 8,
    maxConsecutiveNights: 3,
    maxActiveGuests: 1,
  });

  let firstId = "";

  await t.test("the second request is refused", async () => {
    const first = await command(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId, visitDate: from }),
    );
    firstId = String(first.id);
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({ propertyId: home.propertyId, visitDate: plusDays(from, 1) }),
      ),
      /already has 1 active guest pass/,
    );
  });

  await t.test("cancelling frees the slot", async () => {
    await command(home.resident, home.orgId, {
      action: "visitorStatus",
      id: firstId,
      status: "cancelled",
    });
    assert.equal(
      (await workspace(home.resident, home.orgId)).allowance!.activeGuests,
      0,
    );
    const second = await command(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId, visitDate: plusDays(from, 1) }),
    );
    assert.ok(second.id);
  });
});

test("the pass reaches both the resident and the visitor", async (t) => {
  const home = await fixture();
  const today = sastToday();
  process.env.APP_URL = "https://sangopass.example";
  process.env.EMAIL_FROM = "SangoPass <welcome@example.test>";
  process.env.RESEND_API_KEY = "test-only-not-a-key";

  type Message = {
    to: string[];
    subject: string;
    text: string;
    html: string;
  };
  let sent: Message[] = [];
  const send: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)) as Message);
    return Response.json({ id: "test-message" });
  };

  let visitId = "";

  await t.test("both the resident and the visitor receive a copy", async () => {
    sent = [];
    const created = await commandAndNotify(
      home.resident,
      home.orgId,
      guest({
        propertyId: home.propertyId,
        visitorName: "Nomsa Khumalo",
        visitorEmail: "Nomsa@Example.test",
        visitType: "sleepover",
        visitDate: today,
        arrival: "00:01",
        departure: "23:59",
      }),
      send,
    );
    visitId = String(created.id);
    assert.equal(created.emailStatus, "sent");
    assert.equal(created.visitorEmailed, true);
    assert.equal(sent.length, 2);

    const toHost = sent.find((m) => m.to[0] === home.resident.email)!;
    const toVisitor = sent.find((m) => m.to[0] === "nomsa@example.test")!;
    assert.ok(toHost, "the resident holds a copy for a guest with no phone");
    assert.ok(toVisitor, "the visitor can check they are on the system");

    for (const message of sent) {
      assert.ok(message.text.includes(`/pass/${created.token}`));
      assert.ok(message.text.includes("1 night"));
      // Only the guard or reception scans it, and both copies say so.
      assert.ok(message.text.includes("guard or reception"));
      // The pass link is a capability; the ID number is not in the email.
      assert.ok(!message.text.includes(VALID_ID));
    }
    assert.ok(toHost.subject.includes("Nomsa Khumalo"));
    assert.ok(toVisitor.text.includes("You are on the system"));
    assert.ok(toVisitor.text.includes(home.resident.name));
  });

  await t.test(
    "a visitor with no address still gets in, through the resident",
    async () => {
      sent = [];
      const created = await commandAndNotify(
        home.resident,
        home.orgId,
        guest({ propertyId: home.propertyId, visitDate: baseDate() }),
        send,
      );
      assert.equal(created.emailStatus, "sent");
      assert.equal(created.visitorEmailed, false);
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].to, [home.resident.email]);
      assert.ok(sent[0].text.includes("does not have a phone"));
    },
  );

  await t.test(
    "arrivals are recorded at the gate, never by the resident",
    async () => {
      // The resident holds a copy of the pass so a guest with no phone has
      // something to present, but only the guard or reception scans it.
      await assert.rejects(
        command(home.resident, home.orgId, {
          action: "visitorStatus",
          id: visitId,
          status: "checked_in",
        }),
        /guard or reception/,
      );

      // Reception is a manager account at the property.
      await command(home.owner, home.orgId, {
        action: "visitorStatus",
        id: visitId,
        status: "checked_in",
      });
      assert.equal(
        (await store().get<VisitorRecord>("visitors", visitId))!.status,
        "checked_in",
      );
      await assert.rejects(
        command(home.resident, home.orgId, {
          action: "visitorStatus",
          id: visitId,
          status: "checked_out",
        }),
        /guard or reception/,
      );
      await command(home.owner, home.orgId, {
        action: "visitorStatus",
        id: visitId,
        status: "checked_out",
      });
      const done = await store().get<VisitorRecord>("visitors", visitId);
      assert.equal(done!.status, "checked_out");
      assert.equal(done!.active, 0);
    },
  );

  await t.test("a resident may still cancel their own pass", async () => {
    const created = await commandAndNotify(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId, visitDate: baseDate() }),
      send,
    );
    await command(home.resident, home.orgId, {
      action: "visitorStatus",
      id: String(created.id),
      status: "cancelled",
    });
    assert.equal(
      (await store().get<VisitorRecord>("visitors", String(created.id)))!
        .status,
      "cancelled",
    );
  });

  await t.test("but never somebody else's guest", async () => {
    const neighbour = await fixture();
    const theirs = await command(
      neighbour.resident,
      neighbour.orgId,
      guest({ propertyId: neighbour.propertyId, visitDate: baseDate() }),
    );
    await assert.rejects(
      command(neighbour.owner, home.orgId, {
        action: "visitorStatus",
        id: String(theirs.id),
        status: "checked_in",
      }),
      /access/,
    );
    await assert.rejects(
      command(home.resident, home.orgId, {
        action: "visitorStatus",
        id: String(theirs.id),
        status: "checked_in",
      }),
      /Pass not found/,
    );
  });

  await t.test(
    "without email configured the pass is still created",
    async () => {
      delete process.env.RESEND_API_KEY;
      let called = false;
      const created = await commandAndNotify(
        home.resident,
        home.orgId,
        guest({ propertyId: home.propertyId, visitDate: baseDate() }),
        async () => {
          called = true;
          return new Response();
        },
      );
      assert.equal(called, false);
      assert.equal(created.emailStatus, "not_configured");
      assert.ok(created.token, "the resident can still copy the link");
      process.env.RESEND_API_KEY = "test-only-not-a-key";
    },
  );
});

test("a sleepover may be checked in on any of its nights", async () => {
  const home = await fixture();
  const today = sastToday();
  const created = await command(
    home.resident,
    home.orgId,
    guest({
      propertyId: home.propertyId,
      visitType: "extended_sleepover",
      nights: 2,
      visitDate: today,
      arrival: "00:01",
      departure: "23:59",
    }),
  );
  const id = String(created.id);

  const guardInvite = await command(home.owner, home.orgId, {
    action: "invite",
    email: "gate@example.test",
    role: "security",
    propertyId: home.propertyId,
  });
  const accepted = await join({
    token: guardInvite.token,
    email: "gate@example.test",
    name: "Gate",
    password: pass,
  });
  const gate = (await session(accepted.token))!;

  // The window runs to the departure time on endDate, two days out, so a
  // check-in now is inside it even though the arrival date is today.
  await command(gate, home.orgId, {
    action: "visitorStatus",
    id,
    status: "checked_in",
  });
  const stored = await store().get<VisitorRecord>("visitors", id);
  assert.equal(stored!.status, "checked_in");
  assert.equal(stored!.active, 1, "still occupies a guest slot");

  await command(gate, home.orgId, {
    action: "visitorStatus",
    id,
    status: "checked_out",
  });
  const done = await store().get<VisitorRecord>("visitors", id);
  assert.equal(done!.active, 0, "the slot is released");
});

test("a guest request re-authenticates the resident", async (t) => {
  const home = await fixture();

  await t.test("a wrong password is refused", async () => {
    await assert.rejects(
      command(
        home.resident,
        home.orgId,
        guest({ propertyId: home.propertyId, password: "not my password" }),
      ),
      /password is not correct/,
    );
  });

  await t.test("a missing password is refused", async () => {
    const input = guest({ propertyId: home.propertyId }) as Record<
      string,
      unknown
    >;
    delete input.password;
    await assert.rejects(command(home.resident, home.orgId, input), /password/);
  });

  await t.test("nothing is written when the check fails", async () => {
    assert.equal(
      (await workspace(home.resident, home.orgId)).visitors.length,
      0,
    );
  });

  await t.test("the resident's own password is accepted", async () => {
    const created = await command(
      home.resident,
      home.orgId,
      guest({ propertyId: home.propertyId }),
    );
    assert.ok(created.id);
  });
});
