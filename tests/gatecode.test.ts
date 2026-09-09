import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { randomBytes } from "node:crypto";
import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { commandAndNotify } from "../lib/server/notifications";
import { guestPassSms, sendSms } from "../lib/server/sms";
import { store } from "../lib/server/store";
import type { VisitorRecord } from "../lib/server/store";
import {
  ENTRY_CODE_BYTES,
  ENTRY_CODE_LENGTH,
  encodeEntryCode,
  formatEntryCode,
  normaliseEntryCode,
  sameEntryCode,
} from "../lib/shared/passcode";
import { displayPhone, toE164 } from "../lib/shared/phone";
import { smsNotice } from "../lib/shared/sms";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const sast = (offsetMs = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(Date.now() + offsetMs),
  );

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
      email: `gate-manager${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Gate Estate ${counter}`,
      password: pass,
    },
    { ip: `10.9.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Gate Court ${counter}`,
        address: "Durban",
        type: "apartment",
      })
    ).id,
  );
  const unitId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "unit",
        propertyId,
        label: `D${counter}`,
        rent: 1000,
      })
    ).id,
  );
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: `gate-tenant${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `gate-tenant${counter}@example.test`,
      name: `Resident ${counter}`,
      password: pass,
    },
    { ip: `10.9.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    propertyId,
    resident: (await session(accepted.token))!,
  };
}

const guestRequest = (
  propertyId: string,
  over: Record<string, unknown> = {},
) => ({
  action: "visitor",
  propertyId,
  visitorName: "Lebo Ndlovu",
  phone: "082 441 9087",
  idType: "passport" as const,
  idNumber: "A1234567",
  visitType: "daily" as const,
  visitDate: sast(),
  arrival: "09:00",
  departure: "18:00",
  password: pass,
  ...over,
});

test("the code is built to survive being read aloud and typed back", async (t) => {
  await t.test("five bytes make exactly eight characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = encodeEntryCode(randomBytes(ENTRY_CODE_BYTES));
      assert.equal(code.length, ENTRY_CODE_LENGTH);
      assert.match(code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  await t.test("the confusable letters are never issued", () => {
    // I, L, O and U cannot appear, so nothing a guard reads out is ambiguous
    // and nothing a random draw produces is a word.
    for (let i = 0; i < 500; i += 1)
      assert.doesNotMatch(
        encodeEntryCode(randomBytes(ENTRY_CODE_BYTES)),
        /[ILOU]/,
      );
  });

  await t.test("the same bytes always make the same code", () => {
    assert.equal(
      encodeEntryCode([0, 1, 2, 3, 4]),
      encodeEntryCode(new Uint8Array([0, 1, 2, 3, 4])),
    );
    assert.notEqual(
      encodeEntryCode([0, 0, 0, 0, 0]),
      encodeEntryCode([0, 0, 0, 0, 1]),
    );
  });

  await t.test(
    "it is grouped for reading and stored without the hyphen",
    () => {
      assert.equal(formatEntryCode("4XKD9PWH"), "4XKD-9PWH");
      assert.equal(normaliseEntryCode("4XKD-9PWH"), "4XKD9PWH");
      assert.equal(formatEntryCode("not a gate code"), "");
    },
  );

  await t.test("what a guard actually types is accepted", () => {
    const code = "4XKD9PWH";
    for (const typed of [
      "4xkd9pwh",
      "4XKD-9PWH",
      "4xkd 9pwh",
      " 4XKD9PWH ",
      "4XKD—9PWH".replace("—", "-"),
    ])
      assert.ok(sameEntryCode(typed, code), `${typed} should match`);
  });

  await t.test(
    "a mistyped O or I lands on the character that was meant",
    () => {
      // The alphabet has no O, I or L, so these can only ever be mistakes - and
      // the digit they were mistaken for is the one that was issued.
      assert.equal(normaliseEntryCode("O1234567"), "01234567");
      assert.equal(normaliseEntryCode("I1234567"), "11234567");
      assert.equal(normaliseEntryCode("l1234567"), "11234567");
      // Q is in the alphabet and must not be folded into anything.
      assert.equal(normaliseEntryCode("Q1234567"), "Q1234567");
    },
  );

  await t.test("anything that is not a code is refused", () => {
    for (const value of [
      "",
      "4XKD9PW",
      "4XKD9PWHH",
      "4XKD9PWU",
      "SP-4K7QP2M9XA",
      null,
      undefined,
      12345678,
    ])
      assert.equal(normaliseEntryCode(value), null, `${String(value)}`);
    assert.equal(sameEntryCode("", ""), false);
  });
});

test("every guest pass carries a gate code", async (t) => {
  const { owner, orgId, propertyId, resident } = await home();

  const created = await command(resident, orgId, guestRequest(propertyId));
  const code = String(created.entryCode);

  await t.test("it is issued, stored and unique", async () => {
    assert.equal(normaliseEntryCode(code), code);
    const stored = await store().get<VisitorRecord>(
      "visitors",
      String(created.id),
    );
    assert.equal(stored!.entryCode, code);
    // Claimed the way references and tokens are, so two passes cannot share.
    assert.ok(await store().get("reservations", `visitorCode:${code}`));

    const second = await command(resident, orgId, {
      ...guestRequest(propertyId),
      visitorName: "Karabo Sithole",
    });
    assert.notEqual(second.entryCode, code);
  });

  await t.test("it is not the pass reference", async () => {
    // The reference is printed in every register listing, so a visitor
    // reciting it would prove nothing. These must never be the same value.
    const stored = await store().get<VisitorRecord>(
      "visitors",
      String(created.id),
    );
    assert.notEqual(stored!.entryCode, stored!.reference);
    assert.ok(!stored!.reference.includes(stored!.entryCode));
  });

  await t.test(
    "security at the property can match a recited code",
    async () => {
      const state = await workspace(owner, orgId);
      const visit = state.visitors.find((v) => v.id === created.id);
      assert.ok(visit);
      assert.ok(
        sameEntryCode(visit.entryCode, formatEntryCode(code).toLowerCase()),
      );
    },
  );

  await t.test("a guest of another organisation never matches", async () => {
    const other = await home();
    const theirs = await command(
      other.resident,
      other.orgId,
      guestRequest(other.propertyId, { visitorName: "Nomsa Dube" }),
    );
    const state = await workspace(owner, orgId);
    assert.equal(
      state.visitors.some((v) => sameEntryCode(v.entryCode, theirs.entryCode)),
      false,
    );
  });
});

test("phone numbers are turned into something a gateway will accept", async (t) => {
  await t.test("South African numbers, however they are written", () => {
    for (const written of [
      "0824419087",
      "082 441 9087",
      "(082) 441-9087",
      "+27 82 441 9087",
      "+27824419087",
      "0027824419087",
      "27824419087",
      "824419087",
    ])
      assert.equal(toE164(written), "+27824419087", written);
  });

  await t.test(
    "a number already written for another country is left alone",
    () => {
      assert.equal(toE164("+44 20 7946 0018"), "+442079460018");
      assert.equal(toE164("+1 415 555 0132"), "+14155550132");
    },
  );

  await t.test("what cannot be texted says so", () => {
    for (const written of ["", "  ", "12345", "not a number", "+0123456789"])
      assert.equal(toE164(written), null, JSON.stringify(written));
    assert.equal(toE164(undefined), null);
  });

  await t.test("it reads back the way a person writes it", () => {
    assert.equal(displayPhone("0824419087"), "+27 82 441 9087");
    // Anything it does not understand is shown exactly as it was stored.
    assert.equal(displayPhone("ext. 4417"), "ext. 4417");
  });
});

test("the text message is attempted whether or not email is configured", async (t) => {
  const previous = { ...process.env };
  // Each request needs its own unit: a unit may only hold two active passes,
  // and this test is about the message, not the limit.
  const fresh = async () => home();
  t.after(() => {
    for (const key of [
      "BULKSMS_TOKEN_ID",
      "BULKSMS_TOKEN_SECRET",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "APP_URL",
    ])
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  });

  await t.test(
    "with no credentials nothing is sent and the pass is fine",
    async () => {
      const { orgId, propertyId, resident } = await fresh();
      delete process.env.BULKSMS_TOKEN_ID;
      delete process.env.BULKSMS_TOKEN_SECRET;
      let called = 0;
      const result = await commandAndNotify(
        resident,
        orgId,
        guestRequest(propertyId, { visitorName: "Sipho Khumalo" }),
        (async (url: string) => {
          if (String(url).includes("bulksms")) called += 1;
          return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch,
      );
      assert.equal(result.smsStatus, "not_configured");
      assert.equal(
        called,
        0,
        "no gateway should be called without credentials",
      );
      // The visit itself is untouched by any of this.
      assert.ok(result.id);
      assert.ok(normaliseEntryCode(String(result.entryCode)));
    },
  );

  await t.test("with credentials the gateway is called correctly", async () => {
    const { orgId, propertyId, resident } = await fresh();
    process.env.BULKSMS_TOKEN_ID = "test-token-id";
    process.env.BULKSMS_TOKEN_SECRET = "test-token-secret";
    delete process.env.RESEND_API_KEY;
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await commandAndNotify(
      resident,
      orgId,
      guestRequest(propertyId, { visitorName: "Thandeka Zulu" }),
      (async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response("[]", { status: 201 });
      }) as unknown as typeof fetch,
    );
    assert.equal(result.smsStatus, "sent");
    // Email is not configured, so the only outbound call is the SMS.
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /bulksms/);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(
      headers.Authorization,
      `Basic ${Buffer.from("test-token-id:test-token-secret").toString("base64")}`,
    );
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.to, "+27824419087");
    // The code the guard will be given is the code in the message.
    assert.ok(
      body.body.includes(formatEntryCode(String(result.entryCode))),
      body.body,
    );
  });

  await t.test("both emails carry the code as well as the text", async () => {
    const { orgId, propertyId, resident } = await fresh();
    process.env.BULKSMS_TOKEN_ID = "test-token-id";
    process.env.BULKSMS_TOKEN_SECRET = "test-token-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.EMAIL_FROM = "passes@example.test";
    process.env.APP_URL = "https://sangopass.example";
    const emails: { to: string[]; text: string }[] = [];
    const result = await commandAndNotify(
      resident,
      orgId,
      guestRequest(propertyId, {
        visitorName: "Nomvula Dlamini",
        visitorEmail: "nomvula@example.test",
      }),
      (async (url: string, init: RequestInit) => {
        if (String(url).includes("resend"))
          emails.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    );
    const code = formatEntryCode(String(result.entryCode));
    assert.equal(result.smsStatus, "sent");
    assert.equal(emails.length, 2, "the resident and the visitor");
    // The resident needs it to read out; the visitor needs it if the text
    // never arrived. Both copies carry the same code the guard will match.
    for (const message of emails)
      assert.ok(message.text.includes(code), message.to.join(","));
  });

  await t.test("a gateway that refuses is reported, not thrown", async () => {
    const { orgId, propertyId, resident } = await fresh();
    const result = await commandAndNotify(
      resident,
      orgId,
      guestRequest(propertyId, { visitorName: "Ayanda Molefe" }),
      (async () =>
        new Response("no", { status: 500 })) as unknown as typeof fetch,
    );
    assert.equal(result.smsStatus, "failed");
    assert.ok(result.id, "the pass is still created");
  });

  await t.test(
    "a number that cannot be texted never reaches the gateway",
    async () => {
      const { orgId, propertyId, resident } = await fresh();
      let called = 0;
      const result = await commandAndNotify(
        resident,
        orgId,
        guestRequest(propertyId, {
          visitorName: "No Phone",
          phone: "000 000 000",
        }),
        (async (url: string) => {
          if (String(url).includes("bulksms")) called += 1;
          return new Response("[]", { status: 201 });
        }) as unknown as typeof fetch,
      );
      assert.equal(result.smsStatus, "no_number");
      assert.equal(called, 0);
    },
  );
});

test("the message says what a guest needs and nothing they should not have", () => {
  const body = guestPassSms({
    visitorName: "Lebo Ndlovu",
    propertyName: "Ubuntu Court",
    hostName: "Aisha Petersen",
    entryCode: "4XKD9PWH",
    visitDate: "2026-09-10",
    endDate: "2026-09-10",
    arrival: "09:00",
    departure: "18:00",
    nights: 0,
  });
  assert.ok(body.includes("4XKD-9PWH"));
  assert.ok(body.includes("Ubuntu Court"));
  assert.ok(body.includes("Aisha Petersen"));
  // No link: the guest this is written for has no smartphone to open one on.
  assert.doesNotMatch(body, /https?:\/\//);
  // Short enough not to fragment into several billed messages unnecessarily.
  assert.ok(body.length <= 320, `${body.length} characters`);
});

test("an unsent code still tells the resident what to do", () => {
  for (const status of ["failed", "not_configured", "no_number"])
    assert.match(smsNotice(status), /read (it|the gate code)/i);
  assert.match(smsNotice("sent"), /texted/i);
  // An unknown status must never produce an empty or misleading line.
  assert.ok(smsNotice("something else").length > 0);
});

test("sendSms refuses an untextable number before looking at credentials", async () => {
  let called = 0;
  const status = await sendSms("not a number", "body", (async () => {
    called += 1;
    return new Response("[]", { status: 201 });
  }) as unknown as typeof fetch);
  assert.equal(status, "no_number");
  assert.equal(called, 0);
});
