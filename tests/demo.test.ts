import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import sharp from "sharp";
import jsQR from "jsqr";
import { apply } from "../lib/demo/engine";
import {
  DEMO_PASSWORD,
  PERSONAS,
  seedWorld,
  viewFor,
  type DemoWorld,
} from "../lib/demo/world";
import { sastToday } from "../lib/server/visits";
import { DEFAULT_THEME } from "../lib/shared/theme";
import { currentPeriod, summarise } from "../lib/shared/money";
import { normaliseEntryCode, sameEntryCode } from "../lib/shared/passcode";

const manager = PERSONAS.find((p) => p.role === "manager")!;
const resident = PERSONAS.find((p) => p.role === "tenant")!;
const guard = PERSONAS.find((p) => p.role === "security")!;

const guestRequest = (over: Record<string, unknown> = {}) => ({
  action: "visitor",
  password: DEMO_PASSWORD,
  propertyId: resident.propertyId,
  visitorName: "Thandiwe Mabaso",
  phone: "+27 82 123 4567",
  idType: "sa_id",
  idNumber: "8001015009087",
  visitType: "daily",
  visitDate: sastToday(),
  arrival: "00:01",
  departure: "23:59",
  ...over,
});

test("the demo pass renders a QR code that decodes back to its payload", async () => {
  const world = seedWorld();
  const visit = world.visitors[0];
  const payload = `SANGOPASS-LIVE:${visit.reference}:${visit.token}`;

  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: payload, size: 320, level: "M" }),
  );
  const png = await sharp(Buffer.from(svg))
    .resize(320, 320)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const decoded = jsQR(new Uint8ClampedArray(png), 320, 320);

  assert.ok(decoded, "the rendered pass is scannable");
  assert.equal(decoded!.data, payload);
  // The payload carries no personal detail: a reference and an opaque token.
  assert.ok(!decoded!.data.includes(visit.visitorName));
  assert.ok(!decoded!.data.includes(visit.phone));
});

test("South African dates are read in SAST, not the host timezone", () => {
  const today = sastToday();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    today,
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
    }).format(new Date()),
  );
});

test("the demo shows each role only what that role can see", () => {
  const world = seedWorld();

  const managerView = viewFor(world, manager);
  assert.equal(managerView.properties.length, 2);
  assert.ok(managerView.members.length > 3);
  assert.ok(managerView.contractors.length > 0);
  assert.ok(managerView.invoices.length > 0);
  // Every report in the organisation, most urgent first.
  assert.equal(managerView.reports[0].urgency, "emergency");
  assert.equal(managerView.reports.at(-1)!.urgency, "low");

  const residentView = viewFor(world, resident);
  assert.equal(residentView.properties.length, 1);
  assert.equal(residentView.units.length, 1);
  assert.equal(residentView.members.length, 0);
  assert.equal(residentView.contractors.length, 0);
  assert.equal(residentView.invoices.length, 0);
  assert.ok(residentView.visitors.every((v) => v.hostId === resident.id));
  assert.ok(residentView.reports.every((r) => r.authorId === resident.id));
  assert.ok(residentView.allowance, "a resident sees their allowance");

  const guardView = viewFor(world, guard);
  assert.equal(guardView.units.length, 0);
  assert.equal(guardView.members.length, 0);
  assert.equal(guardView.allowance, null);
  assert.ok(
    guardView.visitors.every((v) => v.propertyId === guard.propertyId),
    "a guard sees only their own property's arrivals",
  );
});

test("a guest can be walked from request to gate", async (t) => {
  let world: DemoWorld = seedWorld();
  let visitId = "";

  await t.test("the resident confirms with their password", () => {
    assert.throws(
      () => apply(world, resident, guestRequest({ password: "wrong" })),
      /password is not correct/,
    );
    // Nothing was written.
    assert.equal(viewFor(world, resident).visitors.length, 1);
  });

  await t.test("a manager cannot request a guest", () => {
    assert.throws(
      () => apply(world, manager, guestRequest()),
      /Only a resident/,
    );
  });

  await t.test("the visitor's ID is validated and masked", () => {
    assert.throws(
      () => apply(world, resident, guestRequest({ idNumber: "8001015009088" })),
      /checksum/,
    );
    const created = apply(world, resident, guestRequest());
    world = created.world;
    visitId = String(created.result.id);
    const visit = viewFor(world, resident).visitors.find(
      (v) => v.id === visitId,
    )!;
    assert.equal(visit.idNumber, "•••••••••9087");
    assert.equal(visit.status, "upcoming");
    assert.equal(visit.hostName, resident.name);
  });

  await t.test("the unit's guest limit is enforced", () => {
    // Ubuntu Court allows two active passes and the seed already used one.
    assert.throws(
      () =>
        apply(world, resident, guestRequest({ visitorName: "One too many" })),
      /already has 2 active guest passes/,
    );
  });

  await t.test("only the guard records the arrival", () => {
    assert.throws(
      () =>
        apply(world, resident, {
          action: "visitorStatus",
          id: visitId,
          status: "checked_in",
        }),
      /guard or reception/,
    );
    world = apply(world, guard, {
      action: "visitorStatus",
      id: visitId,
      status: "checked_in",
    }).world;
    assert.equal(
      viewFor(world, guard).visitors.find((v) => v.id === visitId)!.status,
      "checked_in",
    );
  });

  await t.test("checking out frees the slot for the next guest", () => {
    world = apply(world, guard, {
      action: "visitorStatus",
      id: visitId,
      status: "checked_out",
    }).world;
    const created = apply(
      world,
      resident,
      guestRequest({ visitorName: "Next guest" }),
    );
    world = created.world;
    assert.ok(created.result.id);
  });
});

test("the demo enforces the sleepover budget the manager sets", () => {
  let world = seedWorld();
  // Tighten the limit as the manager, then hit it as the resident.
  world = apply(world, manager, {
    action: "propertyLimits",
    propertyId: resident.propertyId,
    sleepoverNightsPerMonth: 1,
    maxConsecutiveNights: 2,
    maxActiveGuests: 3,
  }).world;

  assert.throws(
    () =>
      apply(
        world,
        resident,
        guestRequest({
          visitType: "extended_sleepover",
          nights: 3,
          arrival: "18:00",
          departure: "09:00",
        }),
      ),
    /at most 2 consecutive nights/,
  );
  assert.throws(
    () =>
      apply(
        world,
        resident,
        guestRequest({
          visitType: "extended_sleepover",
          nights: 2,
          arrival: "18:00",
          departure: "09:00",
        }),
      ),
    /allows 1 sleepover nights/,
  );
  const ok = apply(
    world,
    resident,
    guestRequest({
      visitType: "sleepover",
      arrival: "18:00",
      departure: "09:00",
    }),
  );
  assert.equal(ok.world.visitors.find((v) => v.id === ok.result.id)!.nights, 1);
});

test("residents log issues and the manager triages them", () => {
  let world = seedWorld();
  const before = viewFor(world, manager).reports.length;

  const logged = apply(world, resident, {
    action: "report",
    propertyId: resident.propertyId,
    category: "Maintenance",
    urgency: "low",
    description: "Skirting board coming loose in the passage.",
  });
  world = logged.world;
  const id = String(logged.result.id);

  let queue = viewFor(world, manager).reports;
  assert.equal(queue.length, before + 1);
  // A low issue sinks below every more urgent one, and sits newest-first
  // among the other low ones.
  assert.equal(queue.slice(-2)[0].id, id);
  assert.equal(queue.at(-1)!.urgency, "low");
  assert.equal(queue.find((r) => r.id === id)!.unitLabel, "A-204");

  assert.throws(
    () =>
      apply(world, resident, {
        action: "reportUrgency",
        id,
        urgency: "emergency",
      }),
    /manager or reception account is required/,
  );

  world = apply(world, manager, {
    action: "reportUrgency",
    id,
    urgency: "emergency",
  }).world;
  queue = viewFor(world, manager).reports;
  assert.equal(queue[0].urgency, "emergency");
  assert.ok(
    queue.slice(0, 2).some((r) => r.id === id),
    "re-triaging moves it to the top of the queue",
  );
});

test("the maintenance contacts directory is manager-only", () => {
  let world = seedWorld();
  assert.equal(viewFor(world, resident).contractors.length, 0);
  assert.throws(
    () =>
      apply(world, resident, {
        action: "contractor",
        name: "Sneaky",
        trade: "Plumbing",
        phone: "0821234567",
        kind: "contractor",
      }),
    /manager or reception account is required/,
  );

  const before = viewFor(world, manager).contractors.length;
  world = apply(world, manager, {
    action: "contractor",
    name: "Zodwa Mthembu",
    trade: "Locksmith",
    company: "Keys & Co",
    phone: "+27 84 220 9911",
    email: "zodwa@keys.demo",
    kind: "contractor",
  }).world;
  const list = viewFor(world, manager).contractors;
  assert.equal(list.length, before + 1);
  // Sorted by name, so the panel reads like a phone book.
  assert.deepEqual(
    [...list].map((c) => c.name),
    [...list].map((c) => c.name).sort((a, b) => a.localeCompare(b)),
  );
});

test("a rejected command changes nothing", () => {
  const world = seedWorld();
  const snapshot = JSON.stringify(world);
  assert.throws(() => apply(world, manager, { action: "nonsense" }));
  assert.throws(() =>
    apply(world, manager, {
      action: "property",
      name: "Ubuntu Court",
      address: "Duplicate",
      type: "apartment",
    }),
  );
  assert.equal(JSON.stringify(world), snapshot);
});

test("the manager's colours follow every persona", () => {
  let world = seedWorld();
  assert.deepEqual(viewFor(world, resident).organisation.theme, DEFAULT_THEME);

  world = apply(world, manager, {
    action: "branding",
    primary: "#3D1F42",
    accent: "#E7C6F0",
  }).world;

  // The whole point of the feature: a prospect switches to the resident or the
  // guard and finds the manager's brand already applied.
  for (const persona of PERSONAS)
    assert.deepEqual(viewFor(world, persona).organisation.theme, {
      primary: "#3D1F42",
      accent: "#E7C6F0",
    });

  // The demo runs the server's rules, so it refuses what the server refuses.
  assert.throws(
    () =>
      apply(world, resident, {
        action: "branding",
        primary: "#3D1F42",
        accent: "#E7C6F0",
      }),
    /manager or reception account is required/,
  );
  assert.throws(
    () =>
      apply(world, manager, {
        action: "branding",
        primary: "#F0F0F0",
        accent: "#FFFFFF",
      }),
    /hard to read/,
  );
});

test("the demo issues a gate code for a guest with no smartphone", () => {
  let world = seedWorld();
  // Every sample pass already carries one, so a prospect switching to the
  // guard has something to try before booking anything themselves.
  for (const visit of viewFor(world, manager).visitors)
    assert.equal(
      normaliseEntryCode(visit.entryCode),
      visit.entryCode,
      `${visit.visitorName}: ${visit.entryCode}`,
    );

  const booked = apply(world, resident, guestRequest());
  world = booked.world;
  const code = String(booked.result.entryCode);
  assert.equal(normaliseEntryCode(code), code);
  assert.notEqual(code, booked.result.reference);

  // The guard sees the code on the pass they are about to admit, which is what
  // lets them match a code recited at the gate.
  const atTheGate = viewFor(world, guard).visitors.find(
    (v) => v.id === booked.result.id,
  );
  assert.ok(atTheGate);
  assert.ok(
    sameEntryCode(atTheGate.entryCode, `${code.slice(0, 4)}-${code.slice(4)}`),
  );

  // No two sample passes share a code.
  const codes = viewFor(world, manager).visitors.map((v) => v.entryCode);
  assert.equal(new Set(codes).size, codes.length);
});

test("the demo keeps books a prospect can actually read", async (t) => {
  let world = seedWorld();

  await t.test("a manager sees a month with money in it", () => {
    const state = viewFor(world, manager);
    assert.ok(state.ledger.length > 0);
    const totals = summarise(currentPeriod(), state.ledger, 0);
    assert.ok(totals.expensesCents > 0, "the sample estate has running costs");
    assert.ok(totals.fixedCents > 0 && totals.variableCents > 0);
  });

  await t.test("nobody else sees them at all", () => {
    for (const persona of [resident, guard])
      assert.deepEqual(viewFor(world, persona).ledger, []);
    assert.throws(
      () =>
        apply(world, resident, {
          action: "ledgerEntry",
          kind: "expense",
          category: "utilities",
          nature: "variable",
          amount: 100,
          description: "Not mine to record",
          period: currentPeriod(),
        }),
      // The books are the one thing reception is kept out of too, so this
      // stays the strict manager-only message.
      /manager account is required/,
    );
  });

  await t.test("marking rent paid puts the receipt in the books", () => {
    const before = viewFor(world, manager);
    const unpaid = before.units.find((u) => u.residentName && !u.rentPaid);
    assert.ok(unpaid, "the sample estate has a unit still to pay");
    world = apply(world, manager, {
      action: "rent",
      unitId: unpaid.id,
      paid: true,
    }).world;
    const after = viewFor(world, manager);
    const receipt = after.ledger.find(
      (e) => e.unitId === unpaid.id && e.category === "rent",
    );
    assert.ok(receipt, "the receipt was recorded");
    assert.equal(receipt.amountCents, unpaid.rentCents);
    assert.equal(receipt.kind, "income");
    // And unmarking takes it straight back off, as it does on the server.
    world = apply(world, manager, {
      action: "rent",
      unitId: unpaid.id,
      paid: false,
    }).world;
    assert.equal(
      viewFor(world, manager).ledger.some((e) => e.unitId === unpaid.id),
      false,
    );
  });

  await t.test("the same validation the server runs applies here", () => {
    assert.throws(
      () =>
        apply(world, manager, {
          action: "ledgerEntry",
          kind: "expense",
          category: "rent",
          nature: "fixed",
          amount: 100,
          description: "Rent as a cost",
          period: currentPeriod(),
        }),
      /money coming in/,
    );
  });
});

test("the demo books reconcile: what is marked paid is what was collected", () => {
  const world = seedWorld();
  const state = viewFor(world, manager);
  const open = state.units.filter((u) => !u.archivedAt);
  const paid = open.filter((u) => u.residentName && u.rentPaid);
  const totals = summarise(
    currentPeriod(),
    state.ledger,
    open.filter((u) => u.residentName).reduce((t, u) => t + u.rentCents, 0),
    open.filter((u) => !u.residentName).reduce((t, u) => t + u.rentCents, 0),
  );
  // The sample estate must not show four units marked paid and nothing
  // collected: the register and the books are the same statement.
  assert.ok(paid.length > 0, "the sample estate has rent coming in");
  assert.equal(
    totals.rentCollectedCents,
    paid.reduce((t, u) => t + u.rentCents, 0),
  );
  // And it shows every state a prospect should see: paid, owing, empty, filed.
  assert.ok(
    open.some((u) => u.residentName && !u.rentPaid),
    "one still owing",
  );
  assert.ok(
    open.some((u) => !u.residentName),
    "one empty",
  );
  assert.ok(totals.vacancyCents > 0);
  assert.ok(
    state.units.some((u) => u.archivedAt),
    "one archived",
  );
  // An archived unit is neither owed nor vacancy.
  const archived = state.units.filter((u) => u.archivedAt);
  for (const unit of archived)
    assert.ok(!open.includes(unit), "archived units are out of the month");
});

test("the demo board tells each role what it is addressed", async (t) => {
  const world = seedWorld();
  const desk = PERSONAS.find((p) => p.role === "reception")!;

  await t.test("residents get theirs and not the gate's", () => {
    const titles = viewFor(world, resident).announcements.map((a) => a.title);
    assert.ok(
      titles.some((t) => /water off/i.test(t)),
      "the outage is for everybody",
    );
    assert.ok(
      titles.some((t) => /annual general meeting/i.test(t)),
      "the company-wide one reaches a single building",
    );
    assert.ok(
      !titles.some((t) => /boom/i.test(t)),
      "an instruction to the gate is not a resident's",
    );
  });

  await t.test("the gate gets its own, and not the AGM", () => {
    const titles = viewFor(world, guard).announcements.map((a) => a.title);
    assert.ok(titles.some((t) => /boom/i.test(t)));
    assert.ok(titles.some((t) => /water off/i.test(t)));
    assert.ok(!titles.some((t) => /annual general meeting/i.test(t)));
  });

  await t.test("an expired one is off the dashboards and on the board", () => {
    const seen = viewFor(world, resident).announcements;
    assert.ok(
      !seen.some((a) => /fibre/i.test(a.title)),
      "last month's fibre notice has come down on its own",
    );
    assert.ok(
      viewFor(world, manager).announcements.some((a) => /fibre/i.test(a.title)),
      "and the manager can still see that it went up",
    );
  });

  await t.test("the loudest is first", () => {
    const board = viewFor(world, guard).announcements;
    assert.equal(board[0].level, "urgent");
  });

  await t.test("the desk announces to its building and no further", () => {
    const published = apply(world, desk, {
      action: "announce",
      audience: "residents",
      level: "routine",
      title: "Parcels are in at the desk",
      body: "Collect before six.",
      propertyId: desk.propertyId,
    });
    assert.ok(
      viewFor(published.world, resident).announcements.some(
        (a) => a.title === "Parcels are in at the desk",
      ),
    );
    assert.throws(
      () =>
        apply(world, desk, {
          action: "announce",
          audience: "residents",
          level: "routine",
          title: "Speaking for everybody",
          body: "Both buildings, from one desk.",
          propertyId: "all",
        }),
      /own property/i,
    );
  });

  await t.test("a resident cannot announce", () => {
    assert.throws(
      () =>
        apply(world, resident, {
          action: "announce",
          audience: "everyone",
          level: "urgent",
          title: "Party at mine",
          body: "Everyone welcome.",
          propertyId: resident.propertyId,
        }),
      /manager or reception/i,
    );
  });
});

test("the demo shows who works here and who is on site", async (t) => {
  const world = seedWorld();
  const desk = PERSONAS.find((p) => p.role === "reception")!;

  await t.test("the guard sees every regular at their gate", () => {
    const names = viewFor(world, guard).regulars.map((r) => r.personName);
    assert.equal(names.length, 3, "the cleaner, the contractor and the helper");
    assert.ok(names.some((n) => /Grace/.test(n)));
  });

  await t.test("a resident sees only the one working at their unit", () => {
    const mine = viewFor(world, resident).regulars;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].kind, "household");
    assert.equal(mine[0].unitId, resident.unitId);
  });

  await t.test("and never reads the gate register", () => {
    assert.deepEqual(viewFor(world, resident).movements, []);
  });

  await t.test("somebody is on site, so the question has an answer", () => {
    const open = viewFor(world, guard).movements.filter((m) => !m.outAt);
    assert.equal(open.length, 1);
    assert.match(open[0].personName, /Grace/);
  });

  await t.test("the guard signs somebody out and then back in", () => {
    const out = apply(world, guard, {
      action: "movement",
      id: "demo-regular-1",
      direction: "out",
    });
    assert.equal(
      viewFor(out.world, guard).movements.filter((m) => !m.outAt).length,
      0,
    );
    const back = apply(out.world, guard, {
      action: "movement",
      id: "demo-regular-1",
      direction: "in",
    });
    assert.equal(
      viewFor(back.world, guard).movements.filter((m) => !m.outAt).length,
      1,
    );
  });

  await t.test("signing in somebody already inside is refused", () => {
    assert.throws(
      () =>
        apply(world, guard, {
          action: "movement",
          id: "demo-regular-1",
          direction: "in",
        }),
      /already signed in/i,
    );
  });

  await t.test("a resident cannot record an arrival", () => {
    assert.throws(
      () =>
        apply(world, resident, {
          action: "movement",
          id: "demo-regular-1",
          direction: "out",
        }),
      /guard or reception/i,
    );
  });

  await t.test("the desk issues one and a resident cannot", () => {
    const issued = apply(world, desk, {
      action: "regular",
      propertyId: desk.propertyId,
      personName: "Thabo Ndlovu",
      occupation: "Gardener",
      phone: "+27 82 555 0199",
      kind: "staff",
      idType: "sa_id",
      idNumber: "8001015009087",
      days: "0100100",
      fromTime: "07:00",
      toTime: "12:00",
      startDate: sastToday(),
      endDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    });
    assert.ok(
      viewFor(issued.world, guard).regulars.some(
        (r) => r.personName === "Thabo Ndlovu",
      ),
    );
    assert.throws(
      () =>
        apply(world, resident, {
          action: "regular",
          propertyId: resident.propertyId,
          personName: "My own helper",
          occupation: "Cleaner",
          phone: "+27 82 555 0177",
          kind: "household",
          unitId: resident.unitId,
          idType: "sa_id",
          idNumber: "8001015009087",
          days: "1111100",
          fromTime: "08:00",
          toTime: "16:00",
          startDate: sastToday(),
          endDate: new Date(Date.now() + 60 * 86400000)
            .toISOString()
            .slice(0, 10),
        }),
      /manager or reception/i,
    );
  });

  await t.test("a household pass without a unit is refused", () => {
    assert.throws(
      () =>
        apply(world, desk, {
          action: "regular",
          propertyId: desk.propertyId,
          personName: "Unattached",
          occupation: "Helper",
          phone: "+27 82 555 0166",
          kind: "household",
          idType: "sa_id",
          idNumber: "8001015009087",
          days: "1111100",
          fromTime: "08:00",
          toTime: "16:00",
          startDate: sastToday(),
          endDate: new Date(Date.now() + 60 * 86400000)
            .toISOString()
            .slice(0, 10),
        }),
      /unit this person works at/i,
    );
  });
});
