import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "sangopass-http-"));
const port = Number(process.env.SMOKE_PORT || 3107),
  origin = `http://localhost:${port}`;
let server,
  output = "";
async function start() {
  server = spawn(process.execPath, ["scripts/start.mjs"], {
    env: {
      ...process.env,
      APP_URL: origin,
      PORT: String(port),
      HOSTNAME: "localhost",
      SANGOPASS_DATABASE_PATH: join(directory, "test.sqlite"),
      PAYFAST_MERCHANT_ID: "",
      PAYFAST_MERCHANT_KEY: "",
      PAYFAST_PASSPHRASE: "",
      RESEND_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (d) => (output += d));
  server.stderr.on("data", (d) => (output += d));
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(origin + "/login")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not start: " + output);
}
async function stop() {
  if (server && server.exitCode === null)
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill();
    });
}
async function api(path, input, cookie) {
  const response = await fetch(origin + path, {
    method: input ? "POST" : "GET",
    headers: {
      ...(input ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
    redirect: "manual",
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
const password = "HTTP test account phrase 2026!";
try {
  await start();
  for (const path of [
    "/",
    "/pricing",
    "/login",
    "/register",
    "/demo",
    "/demo/manager",
    "/demo/tenant",
    "/demo/security",
    "/dashboard/manager",
    "/forgot",
    "/brand/community-sa.webp",
    "/brand/sangopass-mark.svg",
  ]) {
    assert.equal((await fetch(origin + path)).status, 200, path);
  }
  assert.equal(
    (await fetch(origin + "/workspace", { redirect: "manual" })).status,
    307,
  );
  // The retired mock dashboard now lands on the real demo.
  assert.equal(
    (await fetch(origin + "/dashboard/admin", { redirect: "manual" })).status,
    307,
  );
  const demoHtml = await (await fetch(origin + "/demo/manager")).text();
  // The demo is server-rendered with its seeded world, so a prospect sees the
  // product immediately rather than an empty shell that fills in later.
  assert.ok(demoHtml.includes("Ubuntu Living"), "seeded organisation");
  assert.ok(demoHtml.includes("Nomsa Dlamini"), "seeded persona");
  assert.ok(demoHtml.includes("DEMO"), "the demo banner is present");
  const residentHtml = await (await fetch(origin + "/demo/tenant")).text();
  assert.ok(residentHtml.includes("Aisha Petersen"));
  assert.equal((await api("/api/workspace")).status, 401);
  const owner = await api("/api/auth/register", {
    name: "Thandi QA",
    email: "owner@example.test",
    organisation: "Ubuntu QA",
    password,
  });
  assert.equal(owner.status, 200);
  assert.match(owner.headers.get("set-cookie"), /httponly/i);
  const initial = await api("/api/workspace", null, owner.cookie);
  const orgId = initial.data.membership.orgId;
  const property = await api(
    "/api/workspace",
    {
      orgId,
      action: "property",
      name: "Cape Court",
      address: "Cape Town",
      type: "apartment",
    },
    owner.cookie,
  );
  assert.equal(property.status, 200);
  const propertyId = property.data.result.id;
  const unit = await api(
    "/api/workspace",
    { orgId, action: "unit", propertyId, label: "A1", rent: 4500 },
    owner.cookie,
  );
  assert.equal(unit.status, 200);
  const invitation = await api(
    "/api/workspace",
    {
      orgId,
      action: "invite",
      propertyId,
      unitId: unit.data.result.id,
      role: "tenant",
      email: "resident@example.test",
    },
    owner.cookie,
  );
  assert.equal(invitation.status, 200);
  assert.equal(invitation.data.result.emailStatus, "not_configured");
  const activationPage = await fetch(
    origin + "/join?token=" + invitation.data.result.token,
  );
  assert.equal(activationPage.status, 200);
  const activationHtml = await activationPage.text();
  assert.ok(activationHtml.includes(invitation.data.result.username));
  assert.ok(activationHtml.includes("A1"));
  const resident = await api("/api/auth/join", {
    token: invitation.data.result.token,
    name: "Aisha QA",
    email: "resident@example.test",
    password,
  });
  assert.equal(resident.status, 200);
  const propertyCode = property.data.state.properties[0].loginCode;
  const tenantLoginPage = await fetch(
    origin + "/tenant/login?property=" + propertyCode,
  );
  assert.equal(tenantLoginPage.status, 200);
  assert.ok((await tenantLoginPage.text()).includes(propertyCode));
  const tenantSignIn = await api("/api/auth/tenant-login", {
    propertyCode,
    username: invitation.data.result.username,
    password,
  });
  assert.equal(tenantSignIn.status, 200);
  assert.equal(tenantSignIn.data.orgId, orgId);
  const tenantState = await api("/api/workspace", null, tenantSignIn.cookie);
  assert.equal(tenantState.data.membership.unitId, unit.data.result.id);
  assert.equal(
    (
      await api(
        "/api/workspace",
        {
          orgId,
          action: "property",
          name: "Forbidden",
          address: "No",
          type: "apartment",
        },
        resident.cookie,
      )
    ).status,
    403,
  );
  const visitDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date());
  const visitor = await api(
    "/api/workspace",
    {
      orgId,
      action: "visitor",
      propertyId,
      visitorName: "Pieter QA",
      phone: "0821234567",
      password,
      idType: "sa_id",
      idNumber: "8001015009087",
      visitType: "sleepover",
      visitDate,
      arrival: "00:01",
      departure: "23:59",
    },
    resident.cookie,
  );
  assert.equal(visitor.status, 200);
  const pass = await fetch(origin + "/pass/" + visitor.data.result.token);
  assert.equal(pass.status, 200);
  const html = await pass.text();
  assert.ok(html.includes("Pieter QA"));
  assert.ok(!html.includes("0821234567"));
  // The visitor can confirm they are on the system, and the pass says so.
  assert.ok(html.includes("You are registered"));
  assert.ok(html.includes("Sleepover"));
  // Only the last four characters of the identity document are ever rendered.
  assert.ok(!html.includes("8001015009087"));
  assert.ok(html.includes("9087"));
  // The gate code, for a guest who arrives without a smartphone. Rendered
  // grouped for reading, and it is not the pass reference.
  const code = String(visitor.data.result.entryCode);
  assert.match(code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  assert.ok(html.includes(`${code.slice(0, 4)}-${code.slice(4)}`));
  assert.notEqual(code, visitor.data.result.reference);

  // A manager may not book a guest; only the resident may.
  assert.equal(
    (
      await api(
        "/api/workspace",
        {
          orgId,
          action: "visitor",
          propertyId,
          visitorName: "Manager QA",
          phone: "0821234567",
          password,
          idType: "sa_id",
          idNumber: "8001015009087",
          visitType: "daily",
          visitDate,
          arrival: "09:00",
          departure: "18:00",
        },
        owner.cookie,
      )
    ).status,
    403,
  );

  // Only the guard or reception records an arrival. The resident holds a copy
  // of the pass so a guest with no phone has something to present.
  assert.equal(
    (
      await api(
        "/api/workspace",
        {
          orgId,
          action: "visitorStatus",
          id: visitor.data.result.id,
          status: "checked_in",
        },
        resident.cookie,
      )
    ).status,
    403,
  );
  const signIn = await api(
    "/api/workspace",
    {
      orgId,
      action: "visitorStatus",
      id: visitor.data.result.id,
      status: "checked_in",
    },
    owner.cookie,
  );
  assert.equal(signIn.status, 200);
  assert.equal(signIn.data.state.visitors[0].status, "checked_in");

  const health = await fetch(origin + "/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const foreign = await api("/api/auth/register", {
    name: "Other QA",
    email: "other@example.test",
    organisation: "Separate QA",
    password,
  });
  assert.equal(
    (await api(`/api/workspace?org=${orgId}`, null, foreign.cookie)).status,
    403,
  );
  const csrf = await fetch(origin + "/api/workspace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
      Cookie: owner.cookie,
    },
    body: JSON.stringify({ orgId, action: "property" }),
  });
  assert.equal(csrf.status, 403);
  assert.equal(
    (
      await api(
        "/api/billing/checkout",
        { orgId, plan: "growth" },
        owner.cookie,
      )
    ).status,
    503,
  );
  // The money spreadsheet: a real file, from a real session, for a manager.
  const current = await api(`/api/workspace?org=${orgId}`, null, owner.cookie);
  const unitId = current.data.units[0].id;
  await api(
    "/api/workspace",
    { orgId, action: "rent", unitId, paid: true },
    owner.cookie,
  );
  await api(
    "/api/workspace",
    {
      orgId,
      action: "ledgerEntry",
      kind: "expense",
      category: "security",
      nature: "fixed",
      amount: 1850,
      description: "Guarding contract",
      period: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg",
      })
        .format(new Date())
        .slice(0, 7),
    },
    owner.cookie,
  );
  const sheet = await fetch(origin + `/api/finance/export?org=${orgId}`, {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") || "", /text\/csv/);
  assert.match(
    sheet.headers.get("content-disposition") || "",
    /attachment; filename=".*-money-\d{4}-\d{2}\.csv"/,
  );
  const book = await sheet.text();
  assert.ok(book.includes("Guarding contract"), "the cost is in the file");
  assert.ok(book.includes('"-1850.00"'), "costs are negative, so the column sums");
  assert.ok(book.includes("Rent collected"), "and rent is reported beside them");
  // A resident may not read the organisation's money.
  const refused = await fetch(origin + `/api/finance/export?org=${orgId}`, {
    headers: { Cookie: resident.cookie },
  });
  assert.equal(refused.status, 403);

  const workspacePage = await fetch(origin + "/workspace", {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(workspacePage.status, 200);
  assert.ok((await workspacePage.text()).includes("Ubuntu QA"));
  await stop();
  await start();
  const persisted = await api("/api/workspace", null, owner.cookie);
  assert.equal(persisted.status, 200);
  assert.equal(persisted.data.properties[0].name, "Cape Court");
  assert.equal(persisted.data.visitors[0].visitorName, "Pieter QA");
  assert.equal((await api("/api/auth/logout", {}, owner.cookie)).status, 200);
  assert.equal((await api("/api/workspace", null, owner.cookie)).status, 401);
  console.log(
    "HTTP smoke passed: public pages, authentication, invitation join, resident pass sharing, tenant isolation, CSRF, SSR, the money spreadsheet and its refusal to a resident, database/session persistence across restart, logout, and missing-payment configuration.",
  );
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  await stop();
}
