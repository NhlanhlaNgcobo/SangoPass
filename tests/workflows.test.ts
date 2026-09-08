import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import sharp from "sharp";
import jsQR from "jsqr";
import { localDate } from "../lib/utils/locale";
import { encodePass, findPass } from "../lib/utils/visitorPass";
import {
  addInvitation,
  cancelInvitation,
  checkInInvitation,
  checkOutInvitation,
  getInvitations,
  searchInvitations,
  DEMO_TENANT,
} from "../lib/mock/visitorsStore";
import { changeDemoPlan, getDemoPlan } from "../lib/mock/billingStore";
import { addTenant, getTenants } from "../lib/mock/tenantsStore";
import { getDemoProperties, updateDemoUnit } from "../lib/mock/propertiesStore";
import {
  addReport,
  getReports,
  updateReportStatus,
} from "../lib/mock/reportsStore";
import { setDemoRole, getDemoRole, clearDemoRole } from "../lib/utils/demoAuth";

const store = new Map<string, string>();
const events = new EventTarget();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  },
});
beforeEach(() => store.clear());
function invite(date = localDate()) {
  return addInvitation({
    ...DEMO_TENANT,
    visitorName: "Ayesha Naidoo",
    visitorPhone: "+27 82 123 4567",
    visitDate: date,
    expectedArrival: "00:00",
    expectedDeparture: "23:59",
  });
}

test("South African dates are correct around UTC midnight", () => {
  assert.equal(localDate(new Date("2026-09-07T22:30:00Z")), "2026-09-08");
  assert.equal(localDate(new Date("2026-09-07T21:30:00Z")), "2026-09-07");
});
test("resident invitation travels through QR, security search, check-in and check-out", async () => {
  setDemoRole("tenant");
  const invitation = invite();
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: encodePass(invitation),
      size: 400,
      marginSize: 4,
    }),
  );
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.ok(decoded);
  assert.equal(findPass(decoded.data, getInvitations())?.id, invitation.id);
  setDemoRole("security");
  assert.equal(
    searchInvitations(invitation.referenceNumber)[0].id,
    invitation.id,
  );
  assert.equal(
    checkInInvitation(invitation.id).find((item) => item.id === invitation.id)
      ?.status,
    "checked_in",
  );
  assert.equal(
    checkOutInvitation(invitation.id).find((item) => item.id === invitation.id)
      ?.status,
    "checked_out",
  );
  setDemoRole("manager");
  assert.equal(
    getInvitations().find((item) => item.id === invitation.id)?.status,
    "checked_out",
  );
});
test("tampered QR tokens fail and legacy GatePass payloads remain compatible", () => {
  const invitation = invite();
  assert.equal(
    findPass(encodePass(invitation) + "tampered", getInvitations()),
    null,
  );
  assert.equal(findPass("https://unrelated.example/", getInvitations()), null);
  assert.equal(
    findPass(
      encodePass(invitation).replace("SANGOPASS-PASS", "GATEPASS-PASS"),
      getInvitations(),
    )?.id,
    invitation.id,
  );
});
test("cancelled and future visitors cannot check in; duplicate check-ins preserve the arrival", () => {
  const cancelled = invite();
  cancelInvitation(cancelled.id);
  assert.equal(
    checkInInvitation(cancelled.id).find((item) => item.id === cancelled.id)
      ?.status,
    "cancelled",
  );
  const future = invite(localDate(new Date(Date.now() + 86400000)));
  assert.equal(
    checkInInvitation(future.id).find((item) => item.id === future.id)?.status,
    "upcoming",
  );
  assert.equal(
    checkOutInvitation(future.id).find((item) => item.id === future.id)?.status,
    "upcoming",
  );
  const valid = invite();
  const first = checkInInvitation(valid.id).find(
    (item) => item.id === valid.id,
  )!;
  const second = checkInInvitation(valid.id).find(
    (item) => item.id === valid.id,
  )!;
  assert.equal(second.checkedInAt, first.checkedInAt);
});
test("invalid invitations fail without changing the visitor store", () => {
  const count = getInvitations().length;
  assert.throws(() => invite("2020-01-01"), /today or a future/);
  assert.throws(
    () =>
      addInvitation({
        ...DEMO_TENANT,
        visitorName: "Test",
        visitorPhone: "bad",
        visitDate: localDate(),
        expectedArrival: "14:00",
        expectedDeparture: "13:00",
      }),
    /phone number/,
  );
  assert.equal(getInvitations().length, count);
});
test("plan selection persists and does not create payment side effects", () => {
  changeDemoPlan("premium");
  assert.equal(getDemoPlan(), "premium");
  changeDemoPlan("starter");
  assert.equal(getDemoPlan(), "starter");
  assert.equal(store.size, 1);
});
test("rent updates persist and update the portfolio totals", () => {
  const before = getDemoProperties()
    .flatMap((p) => p.units)
    .filter((u) => !u.rentPaid).length;
  updateDemoUnit("r-103", {
    rentPaid: true,
    outstandingAmount: 0,
    rentFrequency: "monthly",
  });
  const units = getDemoProperties().flatMap((p) => p.units);
  assert.equal(units.filter((u) => !u.rentPaid).length, before - 1);
  assert.equal(units.find((u) => u.id === "r-103")?.rentFrequency, "monthly");
  assert.throws(
    () => updateDemoUnit("unknown", { rentPaid: true }),
    /not found/,
  );
});
test("resident report can be followed up and resolved by management", () => {
  const report = addReport({
    category: "maintenance",
    description: "Entrance light needs replacing",
    submittedBy: "Thabo M.",
    role: "tenant",
    location: "Riverside entrance",
  });
  updateReportStatus(report.id, "in_progress");
  updateReportStatus(report.id, "resolved");
  assert.equal(
    getReports().find((item) => item.id === report.id)?.status,
    "resolved",
  );
});
test("demo logout clears the selected role", () => {
  setDemoRole("manager");
  assert.equal(getDemoRole(), "manager");
  clearDemoRole();
  assert.equal(getDemoRole(), null);
});

test("adding a resident fills a vacant unit and rejects double assignment", () => {
  const input = {
    name: "Naledi Botha",
    propertyName: "Riverside Student Residence",
    unitNumber: "Room 102",
    studentNumber: "ST-2026-1002",
  };
  const resident = addTenant(input);
  assert.ok(getTenants().some((item) => item.id === resident.id));
  assert.equal(
    getDemoProperties()[0].units.find((unit) => unit.unitNumber === "Room 102")
      ?.tenantName,
    input.name,
  );
  assert.throws(() => addTenant(input), /already has a resident/);
});
