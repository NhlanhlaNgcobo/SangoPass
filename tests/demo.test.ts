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
  const png = await sharp(Buffer.from(svg)).resize(320, 320).ensureAlpha().raw().toBuffer();
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
      () => apply(world, resident, guestRequest({ visitorName: "One too many" })),
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
  assert.equal(
    ok.world.visitors.find((v) => v.id === ok.result.id)!.nights,
    1,
  );
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
    /manager account is required/,
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
    /manager account is required/,
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
