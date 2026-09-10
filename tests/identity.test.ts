import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { sastToday } from "../lib/server/visits";
import {
  ID_VISIBLE,
  maskIdNumber,
  matchesMaskedId,
  normaliseIdNumber,
} from "../lib/shared/identity";

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

/* ------------------------------------------------------------------ */
/* The matcher                                                         */
/* ------------------------------------------------------------------ */

test("the number on the card finds the pass, and so does its tail", () => {
  const masked = maskIdNumber(VALID_ID);
  // The guard holding the visitor's ID types the whole thing.
  assert.equal(matchesMaskedId(masked, VALID_ID), true);
  // The manager who was read the last four over the phone types only those.
  assert.equal(matchesMaskedId(masked, "9087"), true);
  // Nobody types a clean string at a gate at night.
  assert.equal(matchesMaskedId(masked, " 800101 5009-087 "), true);
  assert.equal(matchesMaskedId(masked, "  9087  "), true);
});

test("passports and student numbers are searched the same way", () => {
  assert.equal(matchesMaskedId(maskIdNumber("A1234567"), "A1234567"), true);
  // Typed in lower case, as a phone keyboard offers it.
  assert.equal(matchesMaskedId(maskIdNumber("A1234567"), "a1234567"), true);
  assert.equal(matchesMaskedId(maskIdNumber("A1234567"), "4567"), true);
  assert.equal(matchesMaskedId(maskIdNumber("20001120"), "20001120"), true);
});

test("a different document does not match", () => {
  const masked = maskIdNumber(VALID_ID);
  // One digit out in the visible tail.
  assert.equal(matchesMaskedId(masked, "8001015009088"), false);
  assert.equal(matchesMaskedId(masked, "9088"), false);
  assert.equal(matchesMaskedId(masked, "A1234567"), false);
});

test("too little to be a search matches nothing", () => {
  const masked = maskIdNumber(VALID_ID);
  // Otherwise every keystroke on the way to a name floods the register with
  // whoever happens to share those digits.
  for (const partial of ["", "9", "90", "908"])
    assert.equal(matchesMaskedId(masked, partial), false, `typed "${partial}"`);
  assert.equal(matchesMaskedId(masked, "9087".slice(0, ID_VISIBLE)), true);
});

test("a document the mask hides entirely is not searchable", () => {
  // Four characters or fewer leave no tail to compare, so the mask wins over
  // the search rather than leaking the only characters there are.
  assert.equal(maskIdNumber("1234"), "••••");
  assert.equal(matchesMaskedId(maskIdNumber("1234"), "1234"), false);
  assert.equal(matchesMaskedId("", VALID_ID), false);
});

test("the search normalises a typed number the way the store wrote it", () => {
  // visitorIdentity() stores this form, so the matcher has to reach it too.
  assert.equal(normaliseIdNumber(" 800101-5009 087 "), "8001015009087");
  assert.equal(normaliseIdNumber("a1234567"), "A1234567");
});

/* ------------------------------------------------------------------ */
/* Against what the server actually sends                              */
/* ------------------------------------------------------------------ */

test("a guard can find a real pass by the identity number on the card", async () => {
  const owner = await register(
    {
      email: "id-manager@example.test",
      name: "Manager",
      organisation: "Identity Estate",
      password: pass,
    },
    { ip: "10.7.0.1" },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: "Identity Court",
        address: "Johannesburg",
        type: "apartment",
      })
    ).id,
  );
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
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: "id-resident@example.test",
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: "id-resident@example.test",
      name: "Resident",
      password: pass,
    },
    { ip: "10.7.0.1" },
  );
  const resident = (await session(accepted.token))!;
  await command(resident, owner.orgId, {
    action: "visitor",
    password: pass,
    propertyId,
    visitorName: "Lebo Dlamini",
    phone: "+27 82 123 4567",
    idType: "sa_id",
    idNumber: VALID_ID,
    visitType: "daily",
    visitDate: baseDate(),
    arrival: "09:00",
    departure: "18:00",
  });

  const live = await workspace(owner.user, owner.orgId);
  const visit = live.visitors.find((v) => v.visitorName === "Lebo Dlamini")!;
  assert.ok(visit, "the pass reached the manager's workspace");

  // The payload the browser receives must not carry the real number...
  assert.equal(visit.idNumber, "•••••••••9087");
  assert.ok(
    !JSON.stringify(live).includes(VALID_ID),
    "no full identity number anywhere in the workspace payload",
  );
  // ...and the search must still find the pass from the card in hand.
  assert.equal(matchesMaskedId(visit.idNumber, VALID_ID), true);
  assert.equal(matchesMaskedId(visit.idNumber, "8001015009088"), false);
});
