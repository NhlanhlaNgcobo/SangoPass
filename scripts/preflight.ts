/**
 * Pre-deployment check.
 *
 *   npm run preflight
 *
 * Reads the environment the way the running server will, reports what is
 * configured and what is missing, and exits non-zero if anything would make
 * the deployment unsafe or broken. Safe to run against production credentials:
 * it reads, it never writes, and it prints no secrets.
 */
import {
  appUrl,
  assertDeployable,
  backend,
  billingConfigured,
  emailConfigured,
  ephemeralHost,
  firebase,
  firebaseConfigured,
} from "../lib/server/config";
import { store } from "../lib/server/store";
import { identity } from "../lib/server/identity";

const problems: string[] = [];
const warnings: string[] = [];
const lines: string[] = [];

const tick = (ok: boolean) => (ok ? "  ok  " : " miss ");

function report(label: string, ok: boolean, detail: string) {
  lines.push(`[${tick(ok)}] ${label.padEnd(22)} ${detail}`);
}

async function main() {
  const production = process.env.NODE_ENV === "production";
  lines.push(
    `SangoPass preflight — NODE_ENV=${process.env.NODE_ENV || "(unset)"}`,
    "",
  );

  /* Application ---------------------------------------------------- */
  const url = appUrl();
  report(
    "APP_URL",
    Boolean(url),
    url ? url.origin : "not set (required in production)",
  );
  if (url && url.protocol !== "https:")
    warnings.push(
      `APP_URL is ${url.protocol}// — fine for localhost, fatal in production anywhere else.`,
    );

  /* Storage and identity ------------------------------------------- */
  const chosen = backend();
  const host = ephemeralHost();
  report(
    "Backend",
    true,
    `${chosen}${host ? ` on ${host}` : ""}${
      chosen === "firebase" ? ` (project ${firebase().projectId || "?"})` : ""
    }`,
  );
  if (chosen === "firebase")
    report(
      "Firebase credentials",
      firebaseConfigured(),
      firebaseConfigured()
        ? firebase().emulator
          ? "emulator"
          : "service account"
        : "missing FIREBASE_PROJECT_ID / credentials",
    );
  if (chosen === "firebase" && !firebase().apiKey && !firebase().authEmulator)
    problems.push(
      "FIREBASE_API_KEY is required: passwords are verified through the Identity Toolkit.",
    );

  // Prove the store actually answers before anyone deploys against it.
  try {
    const count = await store().count("organisations");
    report("Storage reachable", true, `${count} organisation(s)`);
  } catch (error) {
    report(
      "Storage reachable",
      false,
      error instanceof Error ? error.message : "unknown error",
    );
    problems.push(
      "The storage backend did not answer. Check credentials, network access and that Firestore is enabled in Native mode.",
    );
  }
  report("Identity backend", true, identity().name);

  /* Payments -------------------------------------------------------- */
  const mode = process.env.PAYFAST_MODE === "live" ? "live" : "sandbox";
  report(
    "PayFast",
    billingConfigured(),
    billingConfigured()
      ? `${mode} mode`
      : "not connected — checkout returns 503 until configured",
  );
  if (billingConfigured() && mode === "sandbox" && production)
    warnings.push(
      "PAYFAST_MODE is sandbox in a production build: no payment will grant paid access.",
    );
  if (mode === "live" && url?.protocol !== "https:")
    problems.push(
      "PAYFAST_MODE is live but APP_URL is not HTTPS. PayFast cannot deliver its notification.",
    );

  /* Email ----------------------------------------------------------- */
  report(
    "Email (Resend)",
    emailConfigured(),
    emailConfigured()
      ? `from ${process.env.EMAIL_FROM}`
      : "not connected — enrolments, guest passes and password recovery will not send",
  );
  if (!emailConfigured())
    warnings.push(
      "Without email, residents cannot reset a password and guest passes must be copied by hand.",
    );

  /* Scheduled work --------------------------------------------------- */
  report(
    "Maintenance",
    true,
    "run `npm run maintenance` daily: sweeps, audit retention, renewal reminders",
  );

  /* Fatal configuration ---------------------------------------------- */
  for (const problem of assertDeployable()) problems.push(problem);
  if (!production)
    warnings.push(
      "NODE_ENV is not production, so the fatal boot checks were only partly evaluated. Re-run with NODE_ENV=production to see exactly what the server will enforce.",
    );

  console.log(lines.join("\n"));
  if (warnings.length) {
    console.log("\nWarnings");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  if (problems.length) {
    console.log("\nBlocking");
    for (const problem of problems) console.log(`  - ${problem}`);
    console.log("\nNot ready to deploy.");
    process.exitCode = 1;
    return;
  }
  console.log("\nReady to deploy.");
}

main()
  .then(() => store().close())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await store()
      .close()
      .catch(() => undefined);
    process.exitCode = 1;
  });
