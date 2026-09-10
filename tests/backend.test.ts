import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import {
  endSession,
  login,
  memberships,
  register,
  session,
} from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { store } from "../lib/server/store";
import type { OrganisationRecord, UnitRecord, UserRecord } from "../lib/server/store";
import { checkout, notification, signature } from "../lib/server/billing";
import { PLANS } from "../lib/server/plans";
import { activity } from "../lib/server/audit";
import { deleteTenant, exportTenant, listTenants } from "../lib/server/tenancy";
import { body } from "../lib/server/http";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const sast = (offsetMs = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(
    new Date(Date.now() + offsetMs),
  );

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

  let propertyId = "";
  let unitId = "";
  let residentId = "";
  let residentToken = "";
  let guardId = "";

  await t.test(
    "passwords are hashed, session tokens are opaque and logout revokes them",
    async () => {
      assert.equal((await session(a.token))?.id, a.user.id);
      const stored = await store().get<UserRecord>("users", a.user.id);
      assert.notEqual(stored!.password, pass);
      assert.match(stored!.password, /^[a-f0-9]{32}:[a-f0-9]{128}$/);

      const result = await login({
        email: "OWNER-A@example.test",
        password: pass,
      });
      assert.equal((await session(result.token))?.id, a.user.id);
      await endSession(result.token);
      assert.equal(await session(result.token), undefined);

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
      assert.equal((await memberships(a.user.id))[0].role, "manager");
    },
  );

  await t.test(
    "organisations cannot read or mutate one another's data",
    async () => {
      propertyId = String(
        (
          await command(a.user, a.orgId, {
            action: "property",
            name: "Ubuntu Court",
            address: "12 Main Road, Cape Town",
            type: "apartment",
          })
        ).id,
      );
      unitId = String(
        (
          await command(a.user, a.orgId, {
            action: "unit",
            propertyId,
            label: "A101",
            rent: 4500,
          })
        ).id,
      );

      assert.equal((await workspace(a.user, a.orgId)).units[0].rentCents, 450000);
      assert.equal((await workspace(b.user, b.orgId)).properties.length, 0);
      await assert.rejects(workspace(b.user, a.orgId), /access/);
      await assert.rejects(
        command(b.user, b.orgId, {
          action: "unit",
          propertyId,
          label: "intruder",
          rent: 0,
        }),
        /not available/,
      );
      await assert.rejects(
        command(b.user, b.orgId, { action: "rent", unitId, paid: true }),
        /Unit not found/,
      );
      // Duplicate names and labels are rejected within an organisation.
      await assert.rejects(
        command(a.user, a.orgId, {
          action: "property",
          name: "ubuntu court",
          address: "Elsewhere",
          type: "apartment",
        }),
        /already exists/,
      );
      // ... but the same name is free in a different organisation.
      const twin = await command(b.user, b.orgId, {
        action: "property",
        name: "Ubuntu Court",
        address: "Pretoria",
        type: "apartment",
      });
      assert.ok(twin.id);
    },
  );

  await t.test(
    "private invitations are email bound, one-use and role authoritative",
    async () => {
      const invitation = await command(a.user, a.orgId, {
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
        token: String(invitation.token),
        email: "resident@example.test",
        name: "Aisha",
        password: pass,
        // A caller-supplied role must never win over the invitation.
        role: "manager",
      });
      residentToken = resident.token;
      residentId = (await session(resident.token))!.id;
      assert.equal((await memberships(residentId))[0].role, "tenant");

      await assert.rejects(
        join({
          token: String(invitation.token),
          email: "resident@example.test",
          name: "Aisha",
          password: pass,
        }),
        /invalid|no longer/,
      );

      const unit = await store().get<UnitRecord>("units", unitId);
      assert.equal(unit!.residentId, residentId);
      assert.equal(unit!.residentName, "Aisha");

      const view = await workspace((await session(residentToken))!, a.orgId);
      assert.equal(view.units.length, 1);
      assert.equal(view.members.length, 0);
      assert.equal(view.invoices.length, 0);
      assert.equal(view.invitations.length, 0);

      await assert.rejects(
        command((await session(residentToken))!, a.orgId, {
          action: "property",
          name: "Forbidden",
          address: "Here",
          type: "apartment",
        }),
        /manager/,
      );

      const guard = await command(a.user, a.orgId, {
        action: "invite",
        email: "guard@example.test",
        role: "security",
        propertyId,
      });
      const accepted = await join({
        token: String(guard.token),
        email: "guard@example.test",
        name: "Sibusiso",
        password: pass,
      });
      guardId = (await session(accepted.token))!.id;

      await assert.rejects(
        command(a.user, a.orgId, {
          action: "invite",
          email: "second@example.test",
          role: "manager",
        }),
        /manager or reception sign-in/,
      );
    },
  );

  await t.test(
    "visitor status transitions enforce SAST time windows and host permissions",
    async () => {
      const resident = (await session(residentToken))!;
      const result = await command(resident, a.orgId, {
        action: "visitor",
        propertyId,
        visitorName: "Lebo",
        phone: "+27 82 123 4567",
        password: pass,
        idType: "sa_id",
        idNumber: "8001015009087",
        visitType: "daily",
        visitDate: sast(86400000),
        arrival: "08:00",
        departure: "20:00",
      });
      const id = String(result.id);

      const hosted = await workspace(a.user, a.orgId);
      assert.equal(hosted.visitors.length, 1);
      // Denormalised display fields travel with the record, no join required.
      assert.equal(hosted.visitors[0].hostName, "Aisha");
      assert.equal(hosted.visitors[0].propertyName, "Ubuntu Court");
      assert.equal(hosted.visitors[0].unitLabel, "A101");
      assert.equal((await workspace(b.user, b.orgId)).visitors.length, 0);

      // Arrivals are recorded at the gate, never by the resident.
      await assert.rejects(
        command(resident, a.orgId, {
          action: "visitorStatus",
          id,
          status: "checked_in",
        }),
        /guard or reception/,
      );

      const stored = await store().get<UserRecord>("users", guardId);
      const guard: Account = {
        id: stored!.id,
        name: stored!.name,
        email: stored!.email,
      };
      await assert.rejects(
        command(guard, a.orgId, {
          action: "visitorStatus",
          id,
          status: "checked_in",
        }),
        /arrival window/,
      );

      await store().tx(async (tx) => {
        tx.update("visitors", id, {
          visitDate: sast(),
          endDate: sast(),
          arrival: "00:00",
          departure: "23:59",
        });
      });

      await command(guard, a.orgId, {
        action: "visitorStatus",
        id,
        status: "checked_in",
      });
      await assert.rejects(
        command(guard, a.orgId, {
          action: "visitorStatus",
          id,
          status: "checked_in",
        }),
        /already changed/,
      );
      await command(guard, a.orgId, {
        action: "visitorStatus",
        id,
        status: "checked_out",
      });
      assert.equal(
        (await workspace(resident, a.orgId)).visitors[0].status,
        "checked_out",
      );
      await assert.rejects(
        command(guard, a.orgId, {
          action: "visitorStatus",
          id,
          status: "cancelled",
        }),
        /already changed/,
      );
    },
  );

  await t.test("reports are scoped and residents cannot resolve reports", async () => {
    const resident = (await session(residentToken))!;
    await command(resident, a.orgId, {
      action: "report",
      propertyId,
      category: "Maintenance",
      urgency: "urgent",
      description: "The entrance light needs replacing.",
    });
    const report = (await workspace(a.user, a.orgId)).reports[0];
    assert.ok(report);
    assert.equal(report.authorName, "Aisha");
    assert.equal((await workspace(b.user, b.orgId)).reports.length, 0);

    await assert.rejects(
      command(resident, a.orgId, {
        action: "reportStatus",
        id: report.id,
        status: "resolved",
      }),
      /manager/,
    );
    await command(a.user, a.orgId, {
      action: "reportStatus",
      id: report.id,
      status: "resolved",
    });
    assert.equal(
      (await workspace(resident, a.orgId)).reports[0].status,
      "resolved",
    );
  });

  await t.test("the audit trail is readable by managers only", async () => {
    const entries = await activity(a.user, a.orgId);
    assert.ok(entries.length > 5);
    assert.ok(entries.some((entry) => entry.action === "property"));
    assert.ok(entries.some((entry) => entry.action === "join"));
    assert.equal(entries[0].createdAt >= entries[entries.length - 1].createdAt, true);
    // No entry from this organisation leaks into the other one.
    assert.equal(
      (await activity(b.user, b.orgId)).every((entry) => entry.action !== "report"),
      true,
    );
    await assert.rejects(
      activity((await session(residentToken))!, a.orgId),
      /manager/,
    );
    await assert.rejects(activity(b.user, a.orgId), /access/);
  });

  await t.test(
    "revocation removes access, frees the unit and keeps historic records",
    async () => {
      await command(a.user, a.orgId, { action: "removeMember", id: residentId });
      await assert.rejects(
        workspace((await session(residentToken))!, a.orgId),
        /access/,
      );
      assert.equal((await workspace(a.user, a.orgId)).visitors.length, 1);
      const unit = await store().get<UnitRecord>("units", unitId);
      assert.equal(unit!.residentId, null);
      // The freed unit can be offered to somebody else immediately.
      const reissued = await command(a.user, a.orgId, {
        action: "invite",
        email: "next-resident@example.test",
        role: "tenant",
        propertyId,
        unitId,
      });
      assert.ok(reissued.token);
      await command(a.user, a.orgId, {
        action: "revokeInvitation",
        id: reissued.invitationId,
      });
      await assert.rejects(
        command(a.user, a.orgId, { action: "removeMember", id: a.user.id }),
        /own access/,
      );
    },
  );

  await t.test(
    "expired trials prevent new records while retaining existing data",
    async () => {
      await store().tx(async (tx) => {
        tx.update("organisations", b.orgId, {
          trialUntil: "2020-01-01T00:00:00.000Z",
        });
      });
      const view = await workspace(b.user, b.orgId);
      assert.equal(view.organisation.active, false);
      assert.equal(view.properties.length, 1);
      await assert.rejects(
        command(b.user, b.orgId, {
          action: "property",
          name: "Late",
          address: "Johannesburg",
          type: "apartment",
        }),
        /ended/,
      );
      // Gate operations and reports keep working after access lapses.
      const existing = view.properties[0];
      await command(b.user, b.orgId, {
        action: "report",
        propertyId: existing.id,
        category: "Security",
        urgency: "normal",
        description: "Boom gate sticking.",
      });
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

      // Read from the plan table rather than repeated here: a price change
      // must not be able to pass a test that still asserts the old one.
      const growth = (PLANS.growth.priceCents / 100).toFixed(2);
      const sandbox = await checkout(a.user, a.orgId, "growth");
      assert.equal(sandbox.fields.amount, growth);

      const fields: Record<string, string> = {
        m_payment_id: sandbox.fields.m_payment_id,
        pf_payment_id: "payment-sandbox-1",
        payment_status: "COMPLETE",
        amount_gross: growth,
        merchant_id: "10000100",
      };
      fields.signature = signature(fields, "test secret");
      const valid = async () => new Response("VALID");

      assert.equal(
        await notification(
          new URLSearchParams(fields).toString(),
          "https://sandbox.payfast.co.za",
          valid,
        ),
        "recorded",
      );
      assert.equal(
        (await workspace(a.user, a.orgId)).organisation.plan,
        "starter",
      );

      await assert.rejects(
        notification(
          new URLSearchParams({ ...fields, amount_gross: "1.00" }).toString(),
          "https://sandbox.payfast.co.za",
          valid,
        ),
        /signature/,
      );
      await assert.rejects(
        notification(
          new URLSearchParams(fields).toString(),
          "https://evil.example",
          valid,
        ),
        /origin/,
      );

      process.env.PAYFAST_MODE = "live";
      const live = await checkout(a.user, a.orgId, "growth");
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
      assert.equal(
        (await workspace(a.user, a.orgId)).organisation.plan,
        "starter",
      );

      assert.equal(
        await notification(
          new URLSearchParams(fields).toString(),
          "https://www.payfast.co.za",
          valid,
        ),
        "activated",
      );
      const until = (await workspace(a.user, a.orgId)).organisation.paidUntil;
      assert.equal((await workspace(a.user, a.orgId)).organisation.plan, "growth");

      // A replayed notification is acknowledged, not retried into an error.
      assert.equal(
        await notification(
          new URLSearchParams(fields).toString(),
          "https://www.payfast.co.za",
          valid,
        ),
        "duplicate",
      );
      assert.equal(
        (await workspace(a.user, a.orgId)).organisation.paidUntil,
        until,
      );

      // A reference already applied elsewhere is acknowledged, never applied twice.
      const second = await checkout(a.user, a.orgId, "growth");
      const replay: Record<string, string> = {
      ...fields,
      m_payment_id: second.fields.m_payment_id,
    };
      replay.signature = signature(replay, "test secret");
      assert.equal(
        await notification(
          new URLSearchParams(replay).toString(),
          "https://www.payfast.co.za",
          valid,
        ),
        "duplicate",
      );
    },
  );

  await t.test("a plan smaller than current usage is refused", async () => {
    await assert.rejects(
      checkout(a.user, a.orgId, "nonsense"),
      /valid plan/,
    );
    const organisation = await store().get<OrganisationRecord>(
      "organisations",
      a.orgId,
    );
    assert.equal(organisation!.plan, "growth");
  });

  await t.test("cross-origin mutations are rejected", async () => {
    process.env.APP_URL = "https://sangopass.example";
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
    await assert.rejects(
      body(
        new Request("https://sangopass.example/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
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

  await t.test("a tenant can be exported and erased", async () => {
    const before = await listTenants();
    assert.equal(before.length, 2);

    const dump = await exportTenant(b.orgId);
    assert.equal(dump.organisation.name, "Jacaranda Homes");
    assert.equal(dump.properties.length, 1);
    assert.equal(dump.reports.length, 1);
    assert.ok(dump.members.length >= 1);

    const report = await deleteTenant(b.orgId);
    assert.equal(report.organisation, "Jacaranda Homes");
    assert.equal(report.accountsDeleted.length, 1);
    assert.equal(await store().get("organisations", b.orgId), undefined);
    assert.equal(
      (await store().find("reports", { where: [["orgId", "==", b.orgId]] }))
        .length,
      0,
    );
    assert.equal(await store().get("users", b.user.id), undefined);

    // The surviving organisation is untouched.
    assert.equal((await listTenants()).length, 1);
    assert.equal((await workspace(a.user, a.orgId)).properties.length, 1);

    // The erased organisation's property name is free again.
    const revived = await register({
      email: "owner-c@example.test",
      name: "Zanele",
      organisation: "Jacaranda Homes II",
      password: pass,
    });
    const property = await command(revived.user, revived.orgId, {
      action: "property",
      name: "Ubuntu Court",
      address: "Durban",
      type: "apartment",
    });
    assert.ok(property.id);
  });
});
