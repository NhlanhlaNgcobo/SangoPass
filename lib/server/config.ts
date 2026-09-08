// Central, validated view of the deployment environment.
//
// The cookie Secure flag used to be derived from APP_URL alone, so an operator
// terminating TLS at a reverse proxy while leaving APP_URL on http:// shipped
// session cookies without Secure over a public HTTPS site. Production now
// refuses to start in that configuration instead of degrading quietly.
export type Backend = "sqlite" | "firebase";

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function appUrl(): URL | undefined {
  if (!process.env.APP_URL) return;
  try {
    return new URL(process.env.APP_URL);
  } catch {
    return;
  }
}

export function appOrigin(request?: Request): string {
  const configured = appUrl();
  if (configured) return configured.origin;
  return request ? new URL(request.url).origin : "http://localhost:3000";
}

/** True when the browser reached us over TLS, honouring a trusted proxy hop. */
export function requestIsSecure(request?: Request): boolean {
  const configured = appUrl();
  if (configured?.protocol === "https:") return true;
  const forwarded = request?.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  if (request) return new URL(request.url).protocol === "https:";
  return false;
}

export function backend(): Backend {
  const chosen = (process.env.SANGOPASS_BACKEND || "").toLowerCase();
  if (chosen === "firebase" || chosen === "firestore") return "firebase";
  if (chosen === "sqlite") return "sqlite";
  return firebaseConfigured() ? "firebase" : "sqlite";
}

export function firebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      ((process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIRESTORE_EMULATOR_HOST),
  );
}

export function firebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  // Service-account keys are usually pasted with escaped newlines.
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(
    /\n/g,
    "\n",
  );
  return {
    projectId,
    clientEmail,
    privateKey,
    apiKey: process.env.FIREBASE_API_KEY || "",
    emulator: process.env.FIRESTORE_EMULATOR_HOST || "",
    authEmulator: process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  };
}

export function billingConfigured() {
  return Boolean(
    process.env.PAYFAST_MERCHANT_ID &&
      process.env.PAYFAST_MERCHANT_KEY &&
      process.env.PAYFAST_PASSPHRASE &&
      process.env.APP_URL,
  );
}

export function emailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.APP_URL,
  );
}

/**
 * Fails fast on configurations that are silently unsafe rather than merely
 * incomplete. Called once from instrumentation at server start.
 */
export function assertDeployable(): string[] {
  const problems: string[] = [];
  if (!isProduction()) return problems;
  const url = appUrl();
  // A showcase deployment issues no sessions, sends no email and takes no
  // payment, so it has no absolute links to build and falls back to the
  // request's own origin for the mutation origin check.
  if (!process.env.APP_URL) {
    if (!demoMode())
      problems.push(
        "APP_URL is required in production: it sets the accepted request origin, the session cookie Secure flag and every absolute payment and recovery link.",
      );
  } else if (!url)
    problems.push(`APP_URL is not a valid absolute URL: ${process.env.APP_URL}`);
  else if (url.protocol !== "https:" && !loopback(url))
    problems.push(
      `APP_URL must be https:// in production (received ${url.protocol}//). Session cookies would be issued without the Secure flag.`,
    );
  if (backend() === "firebase" && !firebaseConfigured())
    problems.push(
      "SANGOPASS_BACKEND=firebase requires FIREBASE_PROJECT_ID plus either FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  if (backend() === "firebase" && !process.env.FIREBASE_API_KEY)
    problems.push(
      "FIREBASE_API_KEY (the Web API key) is required to verify passwords through Firebase Authentication.",
    );
  if (backend() === "sqlite" && ephemeralHost() && !demoMode())
    problems.push(
      `The SQLite backend needs a persistent disk, but this looks like ${ephemeralHost()}, where each invocation gets its own throwaway filesystem: the database would silently vanish between requests. Set SANGOPASS_BACKEND=firebase with Firebase credentials, deploy to a host with a persistent volume, or set SANGOPASS_DEMO=true for a showcase deployment with no stored data.`,
    );
  return problems;
}

/**
 * A showcase deployment: the marketing site plus the interactive demo, which
 * runs entirely in the visitor's browser. Nothing is stored, so ephemeral
 * hosting is correct rather than dangerous, and the sign-in routes say so
 * instead of failing into a blank error.
 */
export function demoMode() {
  return process.env.SANGOPASS_DEMO === "true";
}

/** Loopback origins are already trustworthy, and are how the smoke test runs. */
export function loopback(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
}

/** Names the serverless platform when one is detected, else an empty string. */
export function ephemeralHost(): string {
  if (process.env.SANGOPASS_ALLOW_EPHEMERAL_SQLITE === "true") return "";
  if (process.env.VERCEL) return "Vercel";
  if (process.env.NETLIFY) return "Netlify";
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return "AWS Lambda";
  if (process.env.FUNCTION_TARGET || process.env.K_SERVICE)
    return "Google Cloud Functions or Cloud Run";
  return "";
}
