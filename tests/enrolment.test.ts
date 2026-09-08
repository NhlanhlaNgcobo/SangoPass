import assert from "node:assert/strict";
import { test } from "node:test";
import { register, tenantLogin, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import {
  enrolmentCommand,
  invitationDetails,
  welcomeEmail,
} from "../lib/server/enrolment";
import { one, run } from "../lib/server/db";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
const password = "Welcome home test password 2026!";
test("tenant enrolment emails and property-scoped username logins", async (t) => {
  const owner = await register({
    name: "Nomsa",
    email: "nomsa@example.test",
    organisation: "Ubuntu Residences",
    password,
  });
  const other = await register({
    name: "Other manager",
    email: "manager@example.test",
    organisation: "Separate Residences",
    password,
  });
  const propertyId = String(
    command(owner.user, owner.orgId, {
      action: "property",
      name: "Ubuntu Court",
      address: "Cape Town",
      type: "apartment",
    }).id,
  );
  const studentProperty = String(
    command(owner.user, owner.orgId, {
      action: "property",
      name: "Campus House",
      address: "Johannesburg",
      type: "student_accommodation",
    }).id,
  );
  const unit = (p: string, label: string) =>
    String(
      command(owner.user, owner.orgId, {
        action: "unit",
        propertyId: p,
        label,
        rent: 3000,
      }).id,
    );
  const unitId = unit(propertyId, "A-101"),
    studentUnit = unit(studentProperty, "S-01"),
    secondStudentUnit = unit(studentProperty, "S-02");
  process.env.APP_URL = "https://sangopass.example";
  process.env.EMAIL_FROM = "SangoPass <welcome@example.test>";
  process.env.RESEND_API_KEY = "test-only-not-a-key";
  let message:
    { to: string[]; subject: string; text: string; html: string } | undefined;
  const send: typeof fetch = async (_url, init) => {
    message = JSON.parse(String(init?.body));
    return Response.json({ id: "test-message" });
  };
  let residentId = "",
    username = "",
    residentToken = "";
  await t.test(
    "admin enrols an apartment resident and email contains assigned username, unit and setup link",
    async () => {
      const result = await enrolmentCommand(
        owner.user,
        owner.orgId,
        {
          action: "invite",
          email: "aisha@example.test",
          role: "tenant",
          propertyId,
          unitId,
        },
        send,
      );
      username = String(result.username);
      assert.match(username, /^SP-A101-[A-F0-9]{8}$/);
      assert.equal(result.emailStatus, "sent");
      assert.deepEqual(message!.to, ["aisha@example.test"]);
      assert.ok(message!.text.includes(username));
      assert.ok(message!.text.includes("unit A-101"));
      assert.ok(message!.text.includes("Create your own password"));
      assert.ok(message!.text.includes("/tenant/login?property="));
      assert.ok(!message!.text.includes(password));
      assert.equal(
        one<{ emailStatus: string }>(
          "SELECT emailStatus FROM invitations WHERE id=?",
          String(result.invitationId),
        )!.emailStatus,
        "sent",
      );
      const details = invitationDetails(String(result.token))!;
      assert.equal(details.username, username);
      assert.equal(details.unitLabel, "A-101");
      await assert.rejects(
        tenantLogin({ propertyCode: details.loginCode, username, password }),
        /incorrect/,
      );
      const accepted = await join({
        token: result.token,
        email: "aisha@example.test",
        name: "Aisha",
        password,
        username: "tampered",
        unitId: secondStudentUnit,
      });
      residentId = session(accepted.token)!.id;
      residentToken = accepted.token;
      const state = workspace(session(accepted.token)!, owner.orgId);
      assert.equal(state.membership.username, username);
      assert.equal(state.membership.unitId, unitId);
      const login = await tenantLogin({
        propertyCode: details.loginCode!.toUpperCase(),
        username: username.toLowerCase(),
        password,
      });
      assert.equal(session(login.token)!.id, residentId);
      assert.equal(invitationDetails(String(result.token)), undefined);
    },
  );
  await t.test(
    "student numbers are mandatory, preserve leading zeroes and cannot be reused in the same property",
    async () => {
      assert.throws(
        () =>
          command(owner.user, owner.orgId, {
            action: "invite",
            email: "student@example.test",
            role: "tenant",
            propertyId: studentProperty,
            unitId: studentUnit,
          }),
        /student number/,
      );
      const result = await enrolmentCommand(
        owner.user,
        owner.orgId,
        {
          action: "invite",
          email: "student@example.test",
          role: "tenant",
          propertyId: studentProperty,
          unitId: studentUnit,
          studentNumber: "00123456",
        },
        send,
      );
      assert.equal(result.username, "00123456");
      assert.ok(message!.text.includes("00123456"));
      assert.throws(
        () =>
          command(owner.user, owner.orgId, {
            action: "invite",
            email: "duplicate@example.test",
            role: "tenant",
            propertyId: studentProperty,
            unitId: secondStudentUnit,
            studentNumber: "00123456",
          }),
        /already enrolled/,
      );
      const accepted = await join({
        token: result.token,
        email: "student@example.test",
        name: "Lebo",
        password,
      });
      const code = workspace(owner.user, owner.orgId).properties.find(
        (p) => p.id === studentProperty,
      )!.loginCode;
      assert.equal(
        session(
          (
            await tenantLogin({
              propertyCode: code,
              username: "00123456",
              password,
            })
          ).token,
        )!.id,
        session(accepted.token)!.id,
      );
      await assert.rejects(
        tenantLogin({ propertyCode: code, username: "123456", password }),
        /incorrect/,
      );
      const otherProperty = String(
        command(other.user, other.orgId, {
          action: "property",
          name: "Another campus",
          address: "Durban",
          type: "student_accommodation",
        }).id,
      );
      const otherUnit = String(
        command(other.user, other.orgId, {
          action: "unit",
          propertyId: otherProperty,
          label: "1",
          rent: 0,
        }).id,
      );
      const second = await enrolmentCommand(
        other.user,
        other.orgId,
        {
          action: "invite",
          email: "other-student@example.test",
          role: "tenant",
          propertyId: otherProperty,
          unitId: otherUnit,
          studentNumber: "00123456",
        },
        send,
      );
      const acceptedOther = await join({
        token: second.token,
        email: "other-student@example.test",
        name: "Pieter",
        password: password + " different",
      });
      const otherCode = workspace(other.user, other.orgId).properties[0]
        .loginCode;
      await assert.rejects(
        tenantLogin({
          propertyCode: otherCode,
          username: "00123456",
          password,
        }),
        /incorrect/,
      );
      assert.equal(
        session(
          (
            await tenantLogin({
              propertyCode: otherCode,
              username: "00123456",
              password: password + " different",
            })
          ).token,
        )!.id,
        session(acceptedOther.token)!.id,
      );
    },
  );
  await t.test(
    "failed emails are visible and resending invalidates the previous link",
    async () => {
      const result = await enrolmentCommand(
        owner.user,
        owner.orgId,
        {
          action: "invite",
          email: "retry@example.test",
          role: "tenant",
          propertyId: studentProperty,
          unitId: secondStudentUnit,
          studentNumber: "00987654",
        },
        async () => new Response("Unavailable", { status: 503 }),
      );
      assert.equal(result.emailStatus, "failed");
      assert.equal(
        workspace(owner.user, owner.orgId).invitations.find(
          (i) => i.id === result.invitationId,
        )!.emailStatus,
        "failed",
      );
      const retry = await enrolmentCommand(
        owner.user,
        owner.orgId,
        { action: "resendInvitation", id: result.invitationId },
        send,
      );
      assert.equal(retry.emailStatus, "sent");
      assert.equal(retry.username, result.username);
      assert.equal(invitationDetails(String(result.token)), undefined);
      assert.ok(invitationDetails(String(retry.token)));
      await assert.rejects(
        enrolmentCommand(
          other.user,
          other.orgId,
          { action: "resendInvitation", id: retry.invitationId },
          send,
        ),
        /no longer/,
      );
      command(owner.user, owner.orgId, {
        action: "revokeInvitation",
        id: retry.invitationId,
      });
      assert.equal(invitationDetails(String(retry.token)), undefined);
    },
  );
  await t.test(
    "email configuration absence does not pretend the welcome was sent",
    async () => {
      delete process.env.RESEND_API_KEY;
      let called = false;
      const result = await enrolmentCommand(
        owner.user,
        owner.orgId,
        {
          action: "invite",
          email: "waiting@example.test",
          role: "tenant",
          propertyId: studentProperty,
          unitId: secondStudentUnit,
          studentNumber: "00000012",
        },
        async () => {
          called = true;
          return new Response();
        },
      );
      assert.equal(called, false);
      assert.equal(result.emailStatus, "not_configured");
      assert.equal(
        workspace(owner.user, owner.orgId).invitations.find(
          (i) => i.id === result.invitationId,
        )!.emailSentAt,
        null,
      );
    },
  );
  await t.test(
    "expired plans and non-admin roles cannot enrol tenants; removal revokes username login",
    async () => {
      const resident = session(residentToken)!;
      await assert.rejects(
        enrolmentCommand(resident, owner.orgId, {
          action: "invite",
          role: "tenant",
          email: "no@example.test",
          propertyId,
          unitId,
        }),
        /manager/,
      );
      run(
        "UPDATE organisations SET trialUntil='2020-01-01T00:00:00Z',paidUntil=NULL WHERE id=?",
        other.orgId,
      );
      await assert.rejects(
        enrolmentCommand(other.user, other.orgId, {
          action: "invite",
          role: "tenant",
          email: "no@example.test",
          propertyId,
          unitId,
        }),
        /ended/,
      );
      const code = workspace(owner.user, owner.orgId).properties.find(
        (p) => p.id === propertyId,
      )!.loginCode;
      command(owner.user, owner.orgId, {
        action: "removeMember",
        id: residentId,
      });
      await assert.rejects(
        tenantLogin({ propertyCode: code, username, password }),
        /incorrect/,
      );
    },
  );
  await t.test("welcome email safely escapes property names", () => {
    const result = welcomeEmail(
      {
        id: "test",
        email: "test@example.test",
        role: "tenant",
        username: "001",
        orgName: "<script>bad</script>",
        propertyName: "<img src=x>",
        unitLabel: "A1",
        loginCode: "abc",
        existingAccount: false,
      },
      "a".repeat(64),
      "https://sangopass.example",
    );
    assert.ok(!result.html.includes("<script>"));
    assert.ok(result.html.includes("&lt;script&gt;"));
  });
});
