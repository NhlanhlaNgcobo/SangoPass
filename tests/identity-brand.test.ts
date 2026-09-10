import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { memberships, register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { openLogo, setLogo } from "../lib/server/filing";
import {
  useDocumentStorage,
  type DocumentStorage,
} from "../lib/server/documents";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

function memoryStorage(): DocumentStorage & { size(): number } {
  const files = new Map<string, Uint8Array>();
  return {
    name: "memory",
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      return files.get(key);
    },
    async remove(key) {
      files.delete(key);
    },
    size: () => files.size,
  };
}

// An 8-byte PNG signature stand-in: enough to be bytes, small enough to read.
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG2 = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

let counter = 0;

async function company(): Promise<{
  owner: Account;
  orgId: string;
  resident: Account;
}> {
  counter += 1;
  const owner = await register(
    {
      email: `brand${counter}@example.test`,
      name: "Nomsa Manager",
      organisation: `Old Name ${counter}`,
      password: pass,
    },
    { ip: `10.8.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Court ${counter}`,
        address: "Cape Town",
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
    email: `brand-resident${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `brand-resident${counter}@example.test`,
      name: "Aisha Resident",
      password: pass,
    },
    { ip: `10.8.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    resident: (await session(accepted.token))!,
  };
}

/* ------------------------------------------------------------------ */
/* The company name                                                    */
/* ------------------------------------------------------------------ */

test("renaming the company reaches everyone in it", async (t) => {
  const c = await company();

  await t.test("the new name is stored", async () => {
    await command(c.owner, c.orgId, {
      action: "companyName",
      name: "Ubuntu Living",
    });
    const live = await workspace(c.owner, c.orgId);
    assert.equal(live.organisation.name, "Ubuntu Living");
  });

  await t.test("and follows the denormalised copy on every membership", async () => {
    // Each membership carries the name so the account switcher needs no join.
    // Left unwritten, a rename would be invisible to everyone but whoever made
    // it: their residents would still see the old company in their own list.
    for (const who of [c.owner, c.resident]) {
      const list = await memberships(who.id);
      assert.equal(list[0].orgName, "Ubuntu Living", `for ${who.name}`);
      const live = await workspace(who, c.orgId);
      assert.equal(live.membership.orgName, "Ubuntu Living");
    }
  });

  await t.test("a resident cannot rename the company", async () => {
    await assert.rejects(
      command(c.resident, c.orgId, {
        action: "companyName",
        name: "Mine Now",
      }),
      /manager or reception account is required/,
    );
    assert.equal(
      (await workspace(c.owner, c.orgId)).organisation.name,
      "Ubuntu Living",
    );
  });

  await t.test("an empty name is refused", async () => {
    await assert.rejects(
      command(c.owner, c.orgId, { action: "companyName", name: "   " }),
      /company name/i,
    );
  });

  await t.test("one company's rename never touches another's", async () => {
    const other = await company();
    await command(other.owner, other.orgId, {
      action: "companyName",
      name: "Someone Else",
    });
    assert.equal(
      (await workspace(c.owner, c.orgId)).organisation.name,
      "Ubuntu Living",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The company logo                                                    */
/* ------------------------------------------------------------------ */

test("a company puts its own logo on its dashboards", async (t) => {
  const files = memoryStorage();
  useDocumentStorage(files);
  t.after(() => useDocumentStorage(undefined));

  const c = await company();

  await t.test("there is none to begin with", async () => {
    const live = await workspace(c.owner, c.orgId);
    assert.equal(live.organisation.logoUpdatedAt, "");
    await assert.rejects(openLogo(c.owner, c.orgId), /no logo/i);
  });

  await t.test("the office uploads one", async () => {
    await setLogo(c.owner, c.orgId, { mime: "image/png", data: PNG });
    const live = await workspace(c.owner, c.orgId);
    assert.ok(live.organisation.logoUpdatedAt, "the stamp is set");
    assert.equal(files.size(), 1);
    const opened = await openLogo(c.owner, c.orgId);
    assert.deepEqual(opened.bytes, PNG);
    assert.equal(opened.mime, "image/png");
  });

  await t.test("every role in the organisation can see it", async () => {
    // A logo nobody but the manager could load would be pointless: it exists
    // to sit at the top of the resident's and the guard's dashboard too.
    const opened = await openLogo(c.resident, c.orgId);
    assert.deepEqual(opened.bytes, PNG);
    const live = await workspace(c.resident, c.orgId);
    assert.ok(live.organisation.logoUpdatedAt);
  });

  await t.test("another company's members cannot", async () => {
    const other = await company();
    await assert.rejects(openLogo(other.owner, other.orgId), /no logo/i);
  });

  await t.test("replacing it changes the stamp and drops the old file", async () => {
    const before = (await workspace(c.owner, c.orgId)).organisation
      .logoUpdatedAt;
    await setLogo(c.owner, c.orgId, { mime: "image/png", data: PNG2 });
    const after = (await workspace(c.owner, c.orgId)).organisation
      .logoUpdatedAt;
    assert.notEqual(after, before, "the URL changes, so no stale cache");
    assert.deepEqual((await openLogo(c.owner, c.orgId)).bytes, PNG2);
    assert.equal(files.size(), 1, "the replaced file is not left behind");
  });

  await t.test("only images a browser will draw are accepted", async () => {
    for (const mime of ["image/svg+xml", "application/pdf", "text/html"])
      await assert.rejects(
        setLogo(c.owner, c.orgId, { mime, data: PNG }),
        /PNG, JPEG or WebP/i,
        `refused ${mime}`,
      );
  });

  await t.test("a resident cannot set or remove it", async () => {
    await assert.rejects(
      setLogo(c.resident, c.orgId, { mime: "image/png", data: PNG }),
      /manager or reception account is required/,
    );
    await assert.rejects(
      command(c.resident, c.orgId, { action: "logoRemove" }),
      /manager or reception account is required/,
    );
  });

  await t.test("removing it takes the file with it", async () => {
    await command(c.owner, c.orgId, { action: "logoRemove" });
    const live = await workspace(c.owner, c.orgId);
    assert.equal(live.organisation.logoUpdatedAt, "");
    assert.equal(files.size(), 0, "no orphaned bytes");
    await assert.rejects(openLogo(c.owner, c.orgId), /no logo/i);
    // And removing a logo that is not there says so rather than pretending.
    await assert.rejects(
      command(c.owner, c.orgId, { action: "logoRemove" }),
      /no logo to remove/i,
    );
  });
});
