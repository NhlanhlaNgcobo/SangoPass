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

/**
 * A real PNG header, because the product now reads one.
 *
 * Only the signature and the IHDR chunk - the first 26 bytes, which is all
 * that is needed to state a size and a colour type, and all that setLogo
 * looks at. Colour type 6 is truecolour with alpha, 2 is truecolour without,
 * which is what decides whether the logo is seated on a plate.
 */
function png(width: number, height: number, colourType = 6): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR length, then its name.
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[24] = 8; // bit depth
  bytes[25] = colourType;
  return bytes;
}

const PNG = png(600, 200);
const PNG2 = png(480, 160);

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

  await t.test(
    "and follows the denormalised copy on every membership",
    async () => {
      // Each membership carries the name so the account switcher needs no join.
      // Left unwritten, a rename would be invisible to everyone but whoever made
      // it: their residents would still see the old company in their own list.
      for (const who of [c.owner, c.resident]) {
        const list = await memberships(who.id);
        assert.equal(list[0].orgName, "Ubuntu Living", `for ${who.name}`);
        const live = await workspace(who, c.orgId);
        assert.equal(live.membership.orgName, "Ubuntu Living");
      }
    },
  );

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

  await t.test(
    "its shape is measured, so a dashboard can reserve it",
    async () => {
      // Without this the sidebar is laid out once without the logo and again
      // with it, and everything below the mark jumps as the image arrives.
      const live = await workspace(c.owner, c.orgId);
      assert.equal(live.organisation.logoWidth, 600);
      assert.equal(live.organisation.logoHeight, 200);
    },
  );

  await t.test("a file that can be transparent is not plated", async () => {
    assert.equal(
      (await workspace(c.owner, c.orgId)).organisation.logoPlate,
      false,
    );
  });

  await t.test("one that cannot be transparent is", async () => {
    // Colour type 2 is truecolour with no alpha channel: the image is a solid
    // rectangle, and a solid rectangle on a dark sidebar needs a deliberate
    // plate to look chosen rather than broken.
    await setLogo(c.owner, c.orgId, {
      mime: "image/png",
      data: png(600, 200, 2),
    });
    assert.equal(
      (await workspace(c.owner, c.orgId)).organisation.logoPlate,
      true,
    );
    // And the manager can overrule it, because an RGBA export that happens to
    // be flat white looks transparent from the header and is not.
    await command(c.owner, c.orgId, { action: "logoPlate", plate: false });
    assert.equal(
      (await workspace(c.owner, c.orgId)).organisation.logoPlate,
      false,
    );
    // Put the original back, so the checks that follow are about the logo
    // this run uploaded rather than about this one.
    await setLogo(c.owner, c.orgId, { mime: "image/png", data: PNG });
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

  await t.test(
    "replacing it changes the stamp and drops the old file",
    async () => {
      const before = (await workspace(c.owner, c.orgId)).organisation
        .logoUpdatedAt;
      await setLogo(c.owner, c.orgId, { mime: "image/png", data: PNG2 });
      const after = (await workspace(c.owner, c.orgId)).organisation
        .logoUpdatedAt;
      assert.notEqual(after, before, "the URL changes, so no stale cache");
      assert.deepEqual((await openLogo(c.owner, c.orgId)).bytes, PNG2);
      assert.equal(files.size(), 1, "the replaced file is not left behind");
    },
  );

  await t.test("only images a browser will draw are accepted", async () => {
    for (const mime of ["image/svg+xml", "application/pdf", "text/html"])
      await assert.rejects(
        setLogo(c.owner, c.orgId, { mime, data: PNG }),
        /PNG, JPEG or WebP/i,
        `refused ${mime}`,
      );
  });

  await t.test("the bytes are believed, not the file name", async () => {
    // A browser reports a file's type from its extension, so renaming
    // anything to .png makes it arrive claiming to be one. The header is the
    // only thing that knows better.
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await assert.rejects(
      setLogo(c.owner, c.orgId, { mime: "image/png", data: svg }),
      /not a PNG, JPEG or WebP image/i,
    );
    // And a real PNG that says it is a JPEG is caught the same way.
    await assert.rejects(
      setLogo(c.owner, c.orgId, { mime: "image/jpeg", data: PNG }),
      /actually PNG/i,
    );
  });

  await t.test("a mark too small or too thin to read is refused", async () => {
    await assert.rejects(
      setLogo(c.owner, c.orgId, { mime: "image/png", data: png(16, 16) }),
      /too small/i,
    );
    await assert.rejects(
      setLogo(c.owner, c.orgId, { mime: "image/png", data: png(3000, 60) }),
      /too long and thin/i,
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
    assert.equal(live.organisation.logoWidth, 0, "the shape goes with it");
    assert.equal(live.organisation.logoHeight, 0);
    assert.equal(files.size(), 0, "no orphaned bytes");
    await assert.rejects(openLogo(c.owner, c.orgId), /no logo/i);
    // And removing a logo that is not there says so rather than pretending.
    await assert.rejects(
      command(c.owner, c.orgId, { action: "logoRemove" }),
      /no logo to remove/i,
    );
  });
});
