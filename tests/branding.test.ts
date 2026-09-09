import assert from "node:assert/strict";
import { test } from "node:test";
process.env.SANGOPASS_DATABASE_PATH = ":memory:";
process.env.SANGOPASS_BACKEND = "sqlite";

import { register, session } from "../lib/server/auth";
import { command, join, workspace } from "../lib/server/workspace";
import { store } from "../lib/server/store";
import type { OrganisationRecord } from "../lib/server/store";
import {
  AA,
  AA_LARGE,
  DEFAULT_THEME,
  THEME_PRESETS,
  contrast,
  normaliseHex,
  readableOn,
  resolveTheme,
  themeContrast,
  themeReadable,
  themeVariables,
} from "../lib/shared/theme";
import type { Account } from "../types/workspace";

const pass = "A long secure test phrase 2026!";

const PLUM = { primary: "#3D1F42", accent: "#E7C6F0" };

interface Company {
  owner: Account;
  orgId: string;
  resident: Account;
}

let counter = 0;

/** A manager, a property, a unit and a resident who has accepted their invite. */
async function company(): Promise<Company> {
  counter += 1;
  const owner = await register(
    {
      email: `brand-manager${counter}@example.test`,
      name: `Manager ${counter}`,
      organisation: `Brand Estate ${counter}`,
      password: pass,
    },
    { ip: `10.7.0.${counter}` },
  );
  const propertyId = String(
    (
      await command(owner.user, owner.orgId, {
        action: "property",
        name: `Brand Court ${counter}`,
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
        label: `C${counter}`,
        rent: 1000,
      })
    ).id,
  );
  const invitation = await command(owner.user, owner.orgId, {
    action: "invite",
    email: `brand-tenant${counter}@example.test`,
    role: "tenant",
    propertyId,
    unitId,
  });
  const accepted = await join(
    {
      token: invitation.token,
      email: `brand-tenant${counter}@example.test`,
      name: `Resident ${counter}`,
      password: pass,
    },
    { ip: `10.7.0.${counter}` },
  );
  return {
    owner: owner.user,
    orgId: owner.orgId,
    resident: (await session(accepted.token))!,
  };
}

test("a manager's colours are stored and reach everyone in the organisation", async (t) => {
  const { owner, orgId, resident } = await company();

  await t.test("a new organisation starts on the SangoPass pair", async () => {
    const state = await workspace(owner, orgId);
    assert.deepEqual(state.organisation.theme, DEFAULT_THEME);
  });

  await t.test("saving actually reaches storage", async () => {
    const result = await command(owner, orgId, {
      action: "branding",
      ...PLUM,
    });
    assert.deepEqual(result, PLUM);
    // Read the record back rather than trusting the response: the columns are
    // whitelisted for writing, so a colour that never reaches the row looks
    // saved right up until the next page load.
    const organisation = await store().get<OrganisationRecord>(
      "organisations",
      orgId,
    );
    assert.equal(organisation!.brandPrimary, PLUM.primary);
    assert.equal(organisation!.brandAccent, PLUM.accent);
    const state = await workspace(owner, orgId);
    assert.deepEqual(state.organisation.theme, PLUM);
  });

  await t.test(
    "the resident's dashboard carries the same colours",
    async () => {
      const state = await workspace(resident, orgId);
      assert.equal(state.membership.role, "tenant");
      assert.deepEqual(state.organisation.theme, PLUM);
    },
  );

  await t.test("a hex is normalised on the way in", async () => {
    await command(owner, orgId, {
      action: "branding",
      primary: "#123",
      accent: "e7c6f0",
    });
    const state = await workspace(owner, orgId);
    assert.deepEqual(state.organisation.theme, {
      primary: "#112233",
      accent: "#E7C6F0",
    });
  });

  await t.test("only a manager may change them", async () => {
    await assert.rejects(
      command(resident, orgId, { action: "branding", ...DEFAULT_THEME }),
      /manager account is required/i,
    );
  });

  await t.test(
    "an unreadable pair is refused and nothing is written",
    async () => {
      const before = await workspace(owner, orgId);
      await assert.rejects(
        command(owner, orgId, {
          action: "branding",
          primary: "#F0F0F0",
          accent: "#FFFFFF",
        }),
        /hard to read/i,
      );
      await assert.rejects(
        command(owner, orgId, {
          action: "branding",
          primary: "nonsense",
          accent: "#FFF",
        }),
        /hex code/i,
      );
      const after = await workspace(owner, orgId);
      assert.deepEqual(after.organisation.theme, before.organisation.theme);
    },
  );

  await t.test("colours are not gated on a lapsed trial", async () => {
    await store().tx(async (tx) => {
      tx.update("organisations", orgId, {
        trialUntil: "2020-01-01T00:00:00.000Z",
        paidUntil: null,
      });
    });
    const lapsed = await workspace(owner, orgId);
    assert.equal(lapsed.organisation.active, false);
    await command(owner, orgId, { action: "branding", ...PLUM });
    assert.deepEqual((await workspace(owner, orgId)).organisation.theme, PLUM);
  });

  await t.test(
    "one organisation's colours do not touch another's",
    async () => {
      const other = await company();
      assert.deepEqual(
        (await workspace(other.owner, other.orgId)).organisation.theme,
        DEFAULT_THEME,
      );
    },
  );
});

test("the derived colours cannot produce unreadable text", async (t) => {
  await t.test("every offered preset passes the standard it enforces", () => {
    for (const preset of THEME_PRESETS)
      assert.ok(
        themeReadable(preset),
        `${preset.name} does not meet the contrast it would be saved against`,
      );
  });

  await t.test("the thresholds are the ones being measured", () => {
    const ratios = themeContrast(DEFAULT_THEME);
    assert.ok(ratios.primary >= AA);
    assert.ok(ratios.accent >= AA);
    assert.ok(ratios.pair >= AA_LARGE);
  });

  await t.test("text is chosen for the surface it sits on", () => {
    assert.equal(readableOn("#143E35"), "#FFFFFF");
    assert.equal(readableOn("#D5ED9F"), "#132119");
    assert.ok(contrast("#FFFFFF", "#000000") > 20);
  });

  await t.test("the default pair reproduces the original workspace", () => {
    const variables = themeVariables(DEFAULT_THEME);
    assert.equal(variables["--sp-forest"], "#143E35");
    assert.equal(variables["--sp-lime"], "#D5ED9F");
    assert.equal(variables["--sp-on-forest"], "#FFFFFF");
    // Forest on lime, exactly as the hand-written stylesheet had it.
    assert.equal(variables["--sp-on-lime"], "#143E35");
  });

  await t.test("a light brand still gets readable text on it", () => {
    const light = { primary: "#F4F1E8", accent: "#3D1F42" };
    assert.ok(themeReadable(light));
    const variables = themeVariables(light);
    assert.equal(variables["--sp-on-forest"], "#132119");
    // The hover shade darkens rather than disappearing into the background.
    assert.notEqual(variables["--sp-forest-hover"], variables["--sp-forest"]);
  });

  await t.test("a missing or broken theme falls back per field", () => {
    assert.deepEqual(resolveTheme(undefined), DEFAULT_THEME);
    assert.deepEqual(resolveTheme({ primary: "#3D1F42", accent: "zzz" }), {
      primary: "#3D1F42",
      accent: DEFAULT_THEME.accent,
    });
    // A state saved before the theme existed must not blank the interface.
    assert.equal(
      themeVariables(undefined)["--sp-forest"],
      DEFAULT_THEME.primary,
    );
  });

  await t.test("hex parsing accepts what a person types", () => {
    assert.equal(normaliseHex(" #d5ed9f "), "#D5ED9F");
    assert.equal(normaliseHex("abc"), "#AABBCC");
    assert.equal(normaliseHex("#12345"), null);
    assert.equal(normaliseHex("rgb(1,2,3)"), null);
    assert.equal(normaliseHex(null), null);
  });
});
