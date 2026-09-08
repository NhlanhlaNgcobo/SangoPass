import { assertDeployable } from "@/lib/server/config";

/**
 * Runs once when the server starts. Configurations that are silently unsafe -
 * a production deployment whose APP_URL is not HTTPS, or SQLite on a platform
 * with ephemeral per-request storage - stop the boot rather than degrade in a
 * way nobody notices until data is missing or a cookie ships without Secure.
 */
export async function register() {
  const problems = assertDeployable();
  if (!problems.length) return;
  for (const problem of problems) console.error(`SangoPass config: ${problem}`);
  throw new Error(
    `SangoPass refused to start: ${problems.length} unsafe configuration ${
      problems.length === 1 ? "problem" : "problems"
    }. See the messages above and docs/FIREBASE.md.`,
  );
}
