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
  const resident = await api("/api/auth/join", {
    token: invitation.data.result.token,
    name: "Aisha QA",
    email: "resident@example.test",
    password,
  });
  assert.equal(resident.status, 200);
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
  }).format(new Date(Date.now() + 86400000));
  const visitor = await api(
    "/api/workspace",
    {
      orgId,
      action: "visitor",
      propertyId,
      visitorName: "Pieter QA",
      phone: "0821234567",
      visitDate,
      arrival: "09:00",
      departure: "18:00",
    },
    resident.cookie,
  );
  assert.equal(visitor.status, 200);
  const pass = await fetch(origin + "/pass/" + visitor.data.result.token);
  assert.equal(pass.status, 200);
  const html = await pass.text();
  assert.ok(html.includes("Pieter QA"));
  assert.ok(!html.includes("0821234567"));
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
    "HTTP smoke passed: public pages, authentication, invitation join, resident pass sharing, tenant isolation, CSRF, SSR, database/session persistence across restart, logout, and missing-payment configuration.",
  );
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  await stop();
}
