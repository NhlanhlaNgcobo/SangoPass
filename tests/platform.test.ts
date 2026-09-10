import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { login, register, tenantLogin } from "../lib/server/auth";
import {
  BACKSTOPS,
  bucket,
  sweepRateLimits,
  throttle,
} from "../lib/server/ratelimit";
import { ConflictError, store } from "../lib/server/store";
import { SqliteStore } from "../lib/server/store/sqlite";
import {
  PLANS,
  PLAN_CARDS,
  PLAN_IDS,
  exVatCents,
  includedSms,
  plan,
  vatPortionCents,
} from "../lib/server/plans";
import { assertDeployable, ephemeralHost } from "../lib/server/config";

const pass = "A long secure test phrase 2026!";

test("rate limiting is scoped per tenant, not shared across the platform", async (t) => {
  await t.test(
    "one account's exhausted bucket does not touch another",
    async () => {
      const mine = bucket("scoped:account-a", 3);
      const theirs = bucket("scoped:account-b", 3);
      await throttle([mine]);
      await throttle([mine]);
      await throttle([mine]);
      await assert.rejects(throttle([mine]), /Too many attempts/);
      // The neighbour is completely unaffected.
      await throttle([theirs]);
      await throttle([theirs]);
      await throttle([theirs]);
      await assert.rejects(throttle([theirs]), /Too many attempts/);
    },
  );

  await t.test(
    "a busy residence cannot lock every other organisation out of sign-in",
    async () => {
      const owner = await register(
        {
          email: "busy@example.test",
          name: "Busy manager",
          organisation: "Busy Residences",
          password: pass,
        },
        { ip: "10.0.0.1" },
      );
      assert.ok(owner.orgId);

      // Saturate one property's tenant-login bucket and one caller address.
      const busyProperty = "busycode0001";
      for (let attempt = 0; attempt < 200; attempt += 1)
        await throttle([bucket(`tenant-login:property:${busyProperty}`, 200)]);
      await assert.rejects(
        throttle([bucket(`tenant-login:property:${busyProperty}`, 200)]),
        /Too many attempts/,
      );

      // A manager at a different organisation, from a different address, still
      // signs in. Under the old platform-wide counter this was impossible.
      const signedIn = await login(
        { email: "busy@example.test", password: pass },
        { ip: "10.0.0.2" },
      );
      assert.ok(signedIn.token);

      // And a resident at another property is unaffected.
      await assert.rejects(
        tenantLogin(
          {
            propertyCode: "othercode0001",
            username: "someone",
            password: pass,
          },
          { ip: "10.0.0.3" },
        ),
        /incorrect/,
      );
    },
  );

  await t.test(
    "the global backstops sit far above any single tenant's traffic",
    () => {
      // A Premium tenant is sold 300 units. The backstop must not be something
      // one customer can reach on an ordinary morning.
      assert.ok(BACKSTOPS.logins.limit > PLANS.premium.units * 10);
      assert.ok(BACKSTOPS.registrations.limit >= 2000);
      assert.ok(BACKSTOPS.resets.limit >= 2000);
    },
  );

  await t.test(
    "elapsed windows are swept by maintenance, not by sign-in",
    async () => {
      await store().tx(async (tx) => {
        tx.set("rateLimits", "expired-window", {
          count: 99,
          resetsAt: Date.now() - 1000,
        });
      });
      assert.ok((await sweepRateLimits()) >= 1);
      assert.equal(
        await store().get("rateLimits", "expired-window"),
        undefined,
      );
    },
  );
});

test("the store contract behaves the same way for every backend", async (t) => {
  const isolated = new SqliteStore(":memory:");

  await t.test("uniqueness reservations reject a second claim", async () => {
    await isolated.tx(async (tx) => {
      tx.reserve("demo:key", "owner-1");
    });
    await assert.rejects(
      isolated.tx(async (tx) => {
        tx.reserve("demo:key", "owner-2");
      }),
      ConflictError,
    );
    // Releasing frees it again.
    await isolated.tx(async (tx) => {
      tx.release("demo:key");
    });
    await isolated.tx(async (tx) => {
      tx.reserve("demo:key", "owner-2");
    });
  });

  await t.test(
    "a transaction refuses a read after its first write",
    async () => {
      await assert.rejects(
        isolated.tx(async (tx) => {
          tx.set("organisations", "org-x", {
            name: "X",
            plan: "starter",
            trialUntil: "2030-01-01T00:00:00.000Z",
            paidUntil: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          });
          // Firestore forbids this outright; SQLite refuses so the two agree.
          await tx.get("organisations", "org-x");
        }),
        /every read before the first write/,
      );
    },
  );

  await t.test("a failed transaction commits nothing", async () => {
    await assert.rejects(
      isolated.tx(async (tx) => {
        tx.set("organisations", "org-y", {
          name: "Y",
          plan: "starter",
          trialUntil: "2030-01-01T00:00:00.000Z",
          paidUntil: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        tx.create("reservations", "demo:key", { owner: "z", createdAt: "" });
        tx.create("reservations", "demo:key", { owner: "z", createdAt: "" });
      }),
      ConflictError,
    );
    assert.equal(await isolated.get("organisations", "org-y"), undefined);
  });

  await t.test("queries filter, order and limit", async () => {
    for (const [index, name] of ["Cedar", "Aloe", "Boab"].entries())
      await isolated.tx(async (tx) => {
        tx.create("properties", `p${index}`, {
          orgId: "org-1",
          name,
          address: "Somewhere",
          type: "apartment",
          loginCode: `code${index}`,
        });
      });
    await isolated.tx(async (tx) => {
      tx.create("properties", "other", {
        orgId: "org-2",
        name: "Elsewhere",
        address: "Nowhere",
        type: "apartment",
        loginCode: "code9",
      });
    });
    const ordered = await isolated.find<{ name: string }>("properties", {
      where: [["orgId", "==", "org-1"]],
      orderBy: [{ field: "name" }],
    });
    assert.deepEqual(
      ordered.map((row) => row.name),
      ["Aloe", "Boab", "Cedar"],
    );
    assert.equal(
      await isolated.count("properties", { where: [["orgId", "==", "org-1"]] }),
      3,
    );
    assert.equal((await isolated.find("properties", { limit: 2 })).length, 2);
  });

  await t.test("null comparisons work like Firestore's", async () => {
    await isolated.tx(async (tx) => {
      tx.create("invitations", "i1", {
        orgId: "org-1",
        email: "a@example.test",
        role: "tenant",
        propertyId: null,
        unitId: null,
        hash: "h1",
        expiresAt: "2030-01-01T00:00:00.000Z",
        acceptedAt: null,
        username: null,
        usernameKey: null,
        emailStatus: "not_sent",
        emailSentAt: null,
      });
      tx.create("invitations", "i2", {
        orgId: "org-1",
        email: "b@example.test",
        role: "tenant",
        propertyId: null,
        unitId: null,
        hash: "h2",
        expiresAt: "2030-01-01T00:00:00.000Z",
        acceptedAt: "2026-01-01T00:00:00.000Z",
        username: null,
        usernameKey: null,
        emailStatus: "not_sent",
        emailSentAt: null,
      });
    });
    const open = await isolated.find<{ id: string }>("invitations", {
      where: [
        ["orgId", "==", "org-1"],
        ["acceptedAt", "==", null],
        ["expiresAt", ">", "2026-06-01T00:00:00.000Z"],
      ],
    });
    assert.deepEqual(
      open.map((row) => row.id),
      ["i1"],
    );
  });

  await t.test("unknown fields cannot reach the query translator", async () => {
    await assert.rejects(
      isolated.find("properties", {
        where: [["name = 'x' OR 1=1 --" as string, "==", "y"]],
      }),
      /Unknown field/,
    );
  });

  await isolated.close();
});

test("unsafe deployments are refused at boot", async (t) => {
  // NODE_ENV is typed read-only by the framework's ambient types.
  const env = process.env as Record<string, string | undefined>;
  const saved = { ...env };
  const restore = () => {
    for (const key of Object.keys(env)) if (!(key in saved)) delete env[key];
    Object.assign(env, saved);
  };

  await t.test("plain HTTP in production is fatal", () => {
    env.NODE_ENV = "production";
    env.APP_URL = "http://sangopass.example";
    env.SANGOPASS_BACKEND = "sqlite";
    const problems = assertDeployable();
    assert.ok(problems.some((problem) => problem.includes("https://")));
    restore();
  });

  await t.test("localhost over HTTP is allowed", () => {
    env.NODE_ENV = "production";
    env.APP_URL = "http://localhost:3000";
    env.SANGOPASS_BACKEND = "sqlite";
    assert.deepEqual(assertDeployable(), []);
    restore();
  });

  await t.test("SQLite on ephemeral serverless storage is fatal", () => {
    env.NODE_ENV = "production";
    env.APP_URL = "https://sangopass.example";
    env.SANGOPASS_BACKEND = "sqlite";
    env.VERCEL = "1";
    assert.equal(ephemeralHost(), "Vercel");
    const problems = assertDeployable();
    assert.ok(problems.some((problem) => problem.includes("persistent disk")));
    restore();
  });

  await t.test("a correct production configuration passes", () => {
    env.NODE_ENV = "production";
    env.APP_URL = "https://sangopass.example";
    env.SANGOPASS_BACKEND = "sqlite";
    delete env.VERCEL;
    assert.deepEqual(assertDeployable(), []);
    restore();
  });

  await t.test(
    "a showcase deployment boots on Vercel with no configuration",
    () => {
      // The demo stores nothing, so ephemeral hosting is correct rather than
      // dangerous, and there are no absolute links to build.
      env.NODE_ENV = "production";
      env.SANGOPASS_BACKEND = "sqlite";
      env.SANGOPASS_DEMO = "true";
      env.VERCEL = "1";
      delete env.APP_URL;
      assert.deepEqual(assertDeployable(), []);

      // Turning the flag off restores both guards, so a real deployment can
      // never inherit the demo's permissions by accident.
      env.SANGOPASS_DEMO = "false";
      const problems = assertDeployable();
      assert.ok(problems.some((p) => p.includes("APP_URL is required")));
      assert.ok(problems.some((p) => p.includes("persistent disk")));
      restore();
    },
  );

  restore();
});

test("plan limits have exactly one definition", () => {
  assert.equal(PLANS.starter.units, 25);
  assert.equal(PLANS.growth.units, 150);
  assert.equal(PLANS.premium.units, 300);
  assert.equal(PLANS.starter.managers, 1);
  assert.equal(PLANS.growth.managers, 5);
  assert.equal(PLANS.premium.managers, 10);
  assert.equal(PLANS.starter.priceCents, 69900);
  assert.equal(PLANS.growth.priceCents, 149900);
  assert.equal(PLANS.premium.priceCents, 289900);

  // Every published price includes VAT, so the portion inside it is the
  // seller's to hand over rather than to keep.
  assert.equal(vatPortionCents(69900), 9117);
  assert.equal(exVatCents(69900) + vatPortionCents(69900), 69900);
  for (const id of PLAN_IDS) {
    const p = PLANS[id];
    // A tier a customer cannot read is a tier they will not buy.
    assert.ok(p.audience.length > 20, `${id} says who it is for`);
    assert.ok(p.rules.length >= 4, `${id} lists its rules`);
    // The advertised caps are the enforced caps: the cards read the table.
    const card = PLAN_CARDS.find((c) => c.id === id)!;
    assert.equal(card.unitCap, p.units);
    assert.equal(card.seatCap, p.managers);
    assert.ok(card.rules.some((rule) => rule.includes(String(p.units))));
    // The stated text allowance is the one the allowance function returns.
    assert.equal(includedSms(id, p.units), p.smsPerUnit * p.units);
    assert.ok(
      card.rules.some((rule) =>
        rule.includes(String(includedSms(id, p.units))),
      ),
      `${id} advertises the allowance it grants`,
    );
  }
  // Portfolio is quoted, never sold self-serve, so it has no caps.
  const portfolio = PLAN_CARDS.find((c) => c.id === "portfolio")!;
  assert.equal(portfolio.unitCap, null);
  assert.equal(portfolio.seatCap, null);
  assert.equal(plan("portfolio").id, "starter");
  // Unknown or missing plans fall back to Starter rather than to no limits.
  assert.equal(plan(undefined).units, PLANS.starter.units);
  assert.equal(plan("enterprise-nonsense").units, PLANS.starter.units);
});

test("a showcase deployment really has accounts switched off", async (t) => {
  const { POST } = await import("../app/api/auth/[action]/route");
  const call = (action: string, payload: Record<string, unknown>) =>
    POST(
      new Request("https://demo.sangopass.test/api/auth/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://demo.sangopass.test",
        },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ action }) },
    );

  const previousUrl = process.env.APP_URL;
  process.env.APP_URL = "https://demo.sangopass.test";
  process.env.SANGOPASS_DEMO = "true";

  await t.test("registering is refused, and says where to go", async () => {
    // The sign-in screens already told a visitor accounts were off. The API
    // did not, and on a host with a throwaway filesystem that meant an
    // account which worked once and then vanished.
    const response = await call("register", {
      name: "Curious Prospect",
      email: "prospect@example.test",
      organisation: "Anywhere",
      password: "a long enough password 2026!",
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /\/demo/);
  });

  await t.test("so is signing in, joining and password recovery", async () => {
    for (const action of ["login", "tenant-login", "join", "forgot", "reset"])
      assert.equal(
        (await call(action, {})).status,
        403,
        `${action} should be refused`,
      );
  });

  await t.test("signing out is not refused by the mode", async () => {
    // It takes access away rather than granting it, and refusing it would
    // strand anyone holding a cookie from before the switch was thrown. The
    // call cannot succeed in this harness, because reading the cookie needs a
    // real request scope - what matters here is that the demo guard lets it
    // through rather than answering 403 like everything else.
    assert.notEqual((await call("logout", {})).status, 403);
  });

  await t.test("and none of this applies to a real deployment", async () => {
    delete process.env.SANGOPASS_DEMO;
    const response = await call("login", {
      email: "nobody@example.test",
      password: "wrong password entirely",
    });
    assert.notEqual(response.status, 403, "refused on its merits, not by mode");
  });

  process.env.APP_URL = previousUrl;
});
