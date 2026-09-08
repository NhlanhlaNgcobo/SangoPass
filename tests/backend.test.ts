import assert from "node:assert/strict";
import { test } from "node:test";
import {
  register,
  login,
  session,
  endSession,
  memberships,
  hashToken,
  newToken,
} from "../lib/server/auth";
import { workspace, command, join } from "../lib/server/workspace";
import { one, run } from "../lib/server/db";
import { checkout, notification, signature } from "../lib/server/billing";
import { resetPassword } from "../lib/server/recovery";
import { body } from "../lib/server/http";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
const pass = "A long secure test phrase 2026!";
test("real SaaS workflows preserve tenant isolation, role boundaries and payment integrity", async (t) => {
  const a = await register({
    email: "owner-a@example.test",
    name: "Thandi",
    organisation: "Ubuntu Living",
    password: pass,
  });
  const b = await register({
    email: "owner-b@example.test",
    name: "Pieter",
    organisation: "Jacaranda Homes",
    password: pass,
  });
  let propertyId = "",
    unitId = "",
    residentId = "",
    residentToken = "",
    guardId = "";
  await t.test(
    "passwords are hashed, session tokens are opaque and logout revokes them",
    async () => {
      assert.equal(session(a.token)?.id, a.user.id);
      assert.notEqual(
        one<{ password: string }>(
          "SELECT password FROM users WHERE id=?",
          a.user.id,
        )!.password,
        pass,
      );
      const result = await login({
        email: "OWNER-A@example.test",
        password: pass,
      });
      assert.equal(session(result.token)?.id, a.user.id);
      endSession(result.token);
      assert.equal(session(result.token), undefined);
      await assert.rejects(
        login({ email: a.user.email, password: "wrong" }),
        /incorrect/,
      );
      await assert.rejects(
        register({
          email: a.user.email,
          name: "Duplicate",
          organisation: "Fake",
          password: pass,
        }),
        /already exists/,
      );
      assert.equal(memberships(a.user.id)[0].role, "manager");
    },
  );
  await t.test("organisations cannot read or mutate one another's data", () => {
    propertyId = String(
      command(a.user, a.orgId, {
        action: "property",
        name: "Ubuntu Court",
        address: "12 Main Road, Cape Town",
        type: "apartment",
      }).id,
    );
    unitId = String(
      command(a.user, a.orgId, {
        action: "unit",
        propertyId,
        label: "A101",
        rent: 4500,
      }).id,
    );
    assert.equal(workspace(a.user, a.orgId).units[0].rentCents, 450000);
    assert.equal(workspace(b.user, b.orgId).properties.length, 0);
    assert.throws(() => workspace(b.user, a.orgId), /access/);
    assert.throws(
      () =>
        command(b.user, b.orgId, {
          action: "unit",
          propertyId,
          label: "intruder",
          rent: 0,
        }),
      /not available/,
    );
    assert.throws(
      () => command(b.user, b.orgId, { action: "rent", unitId, paid: true }),
      /not available/,
    );
  });
  await t.test(
    "private invitations are email bound, one-use and role authoritative",
    async () => {
      const invitation = command(a.user, a.orgId, {
        action: "invite",
        email: "resident@example.test",
        role: "tenant",
        propertyId,
        unitId,
      });
      await assert.rejects(
        join({
          token: invitation.token,
          email: "other@example.test",
          name: "Wrong",
          password: pass,
        }),
        /another email/,
      );
      const resident = await join({
        token: invitation.token,
        email: "resident@example.test",
        name: "Aisha",
        password: pass,
        role: "manager",
      });
      residentToken = resident.token;
      residentId = session(resident.token)!.id;
      assert.equal(memberships(residentId)[0].role, "tenant");
      await assert.rejects(
        join({
          token: invitation.token,
          email: "resident@example.test",
          name: "Aisha",
          password: pass,
        }),
        /invalid/,
      );
      assert.equal(
        workspace(session(resident.token)!, a.orgId).units.length,
        1,
      );
      assert.equal(
        workspace(session(resident.token)!, a.orgId).members.length,
        0,
      );
      assert.throws(
        () =>
          command(session(resident.token)!, a.orgId, {
            action: "property",
            name: "Forbidden",
            address: "Here",
            type: "apartment",
          }),
        /manager/,
      );
      const guard = command(a.user, a.orgId, {
        action: "invite",
        email: "guard@example.test",
        role: "security",
        propertyId,
      });
      const accepted = await join({
        token: guard.token,
        email: "guard@example.test",
        name: "Sibusiso",
        password: pass,
      });
      guardId = session(accepted.token)!.id;
      assert.throws(
        () =>
          command(a.user, a.orgId, {
            action: "invite",
            email: "second@example.test",
            role: "manager",
          }),
        /manager limit/,
      );
    },
  );
  await t.test(
    "visitor status transitions enforce SAST time windows and host permissions",
    () => {
      const resident = session(residentToken)!;
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
      }).format(new Date(Date.now() + 86400000));
      const result = command(resident, a.orgId, {
        action: "visitor",
        propertyId,
        visitorName: "Lebo",
        phone: "+27 82 123 4567",
        visitDate: date,
        arrival: "08:00",
        departure: "20:00",
      });
      const id = String(result.id);
      assert.equal(workspace(a.user, a.orgId).visitors.length, 1);
      assert.equal(workspace(b.user, b.orgId).visitors.length, 0);
      assert.throws(
        () =>
          command(resident, a.orgId, {
            action: "visitorStatus",
            id,
            status: "checked_in",
          }),
        /only cancel/,
      );
      const guard = one<{ id: string; name: string; email: string }>(
        "SELECT id,name,email FROM users WHERE id=?",
        guardId,
      )!;
      assert.throws(
        () =>
          command(guard, a.orgId, {
            action: "visitorStatus",
            id,
            status: "checked_in",
          }),
        /arrival window/,
      );
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
      }).format(new Date());
      run(
        "UPDATE visitors SET visitDate=?,arrival='00:00',departure='23:59' WHERE id=?",
        today,
        id,
      );
      command(guard, a.orgId, {
        action: "visitorStatus",
        id,
        status: "checked_in",
      });
      assert.throws(
        () =>
          command(guard, a.orgId, {
            action: "visitorStatus",
            id,
            status: "checked_in",
          }),
        /already changed/,
      );
      command(guard, a.orgId, {
        action: "visitorStatus",
        id,
        status: "checked_out",
      });
      assert.equal(
        workspace(resident, a.orgId).visitors[0].status,
        "checked_out",
      );
      assert.throws(
        () =>
          command(guard, a.orgId, {
            action: "visitorStatus",
            id,
            status: "cancelled",
          }),
        /already changed/,
      );
    },
  );
  await t.test(
    "reports are scoped and residents cannot resolve reports",
    () => {
      const resident = session(residentToken)!;
      command(resident, a.orgId, {
        action: "report",
        propertyId,
        category: "Maintenance",
        description: "The entrance light needs replacing.",
      });
      const report = workspace(a.user, a.orgId).reports[0];
      assert.ok(report);
      assert.equal(workspace(b.user, b.orgId).reports.length, 0);
      assert.throws(
        () =>
          command(resident, a.orgId, {
            action: "reportStatus",
            id: report.id,
            status: "resolved",
          }),
        /manager/,
      );
      command(a.user, a.orgId, {
        action: "reportStatus",
        id: report.id,
        status: "resolved",
      });
      assert.equal(workspace(resident, a.orgId).reports[0].status, "resolved");
    },
  );
  await t.test(
    "revocation removes access without deleting historic records",
    () => {
      command(a.user, a.orgId, { action: "removeMember", id: residentId });
      assert.throws(
        () => workspace(session(residentToken)!, a.orgId),
        /access/,
      );
      assert.equal(workspace(a.user, a.orgId).visitors.length, 1);
      assert.throws(
        () =>
          command(a.user, a.orgId, { action: "removeMember", id: a.user.id }),
        /own access/,
      );
    },
  );
  await t.test(
    "expired trials prevent new records while retaining existing data",
    () => {
      run(
        "UPDATE organisations SET trialUntil='2020-01-01T00:00:00.000Z' WHERE id=?",
        b.orgId,
      );
      assert.equal(workspace(b.user, b.orgId).organisation.active, false);
      assert.throws(
        () =>
          command(b.user, b.orgId, {
            action: "property",
            name: "Late",
            address: "Johannesburg",
            type: "apartment",
          }),
        /ended/,
      );
    },
  );
  await t.test(
    "checkout is server priced; only verified live payments activate plans, once",
    async () => {
      process.env.APP_URL = "https://sangopass.example";
      process.env.PAYFAST_MERCHANT_ID = "10000100";
      process.env.PAYFAST_MERCHANT_KEY = "test-merchant";
      process.env.PAYFAST_PASSPHRASE = "test secret";
      process.env.PAYFAST_MODE = "sandbox";
      const sandbox = checkout(a.user, a.orgId, "growth");
      assert.equal(sandbox.fields.amount, "1299.00");
      const fields: Record<string, string> = {
        m_payment_id: sandbox.fields.m_payment_id,
        pf_payment_id: "payment-sandbox-1",
        payment_status: "COMPLETE",
        amount_gross: "1299.00",
        merchant_id: "10000100",
      };
      fields.signature = signature(fields, "test secret");
      const valid = async () => new Response("VALID");
      await notification(
        new URLSearchParams(fields).toString(),
        "https://sandbox.payfast.co.za",
        valid,
      );
      assert.equal(workspace(a.user, a.orgId).organisation.plan, "starter");
      await assert.rejects(
        notification(
          new URLSearchParams({ ...fields, amount_gross: "1.00" }).toString(),
          "https://sandbox.payfast.co.za",
          valid,
        ),
        /signature/,
      );
      process.env.PAYFAST_MODE = "live";
      const live = checkout(a.user, a.orgId, "growth");
      fields.m_payment_id = live.fields.m_payment_id;
      fields.pf_payment_id = "payment-live-1";
      fields.signature = signature(fields, "test secret");
      await assert.rejects(
        notification(
          new URLSearchParams(fields).toString(),
          "https://www.payfast.co.za",
          async () => new Response("INVALID"),
        ),
        /verified/,
      );
      assert.equal(workspace(a.user, a.orgId).organisation.plan, "starter");
      await notification(
        new URLSearchParams(fields).toString(),
        "https://www.payfast.co.za",
        valid,
      );
      const until = workspace(a.user, a.orgId).organisation.paidUntil;
      assert.equal(workspace(a.user, a.orgId).organisation.plan, "growth");
      await notification(
        new URLSearchParams(fields).toString(),
        "https://www.payfast.co.za",
        valid,
      );
      assert.equal(workspace(a.user, a.orgId).organisation.paidUntil, until);
    },
  );
  await t.test("cross-origin mutations are rejected", async () => {
    await assert.rejects(
      body(
        new Request("https://sangopass.example/api/workspace", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      ),
      /origin/,
    );
    assert.deepEqual(
      await body(
        new Request("https://sangopass.example/api/workspace", {
          method: "POST",
          headers: {
            origin: "https://sangopass.example",
            "content-type": "application/json",
          },
          body: '{"action":"property"}',
        }),
      ),
      { action: "property" },
    );
  });
  await t.test(
    "password resets are single use and revoke all previous sessions",
    async () => {
      const token = newToken();
      run(
        "INSERT INTO reset_tokens VALUES(?,?,?)",
        hashToken(token),
        a.user.id,
        new Date(Date.now() + 60000).toISOString(),
      );
      await resetPassword({ token, password: pass + " new" });
      assert.equal(session(a.token), undefined);
      await assert.rejects(resetPassword({ token, password: pass }), /expired/);
      assert.ok(
        (await login({ email: a.user.email, password: pass + " new" })).token,
      );
    },
  );
});
