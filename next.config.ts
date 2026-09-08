import type { NextConfig } from "next";

// The scanner decodes untrusted QR payloads from the camera and the guest pass
// is a public unauthenticated page, so the script and connect sources are
// pinned. 'unsafe-inline' remains for styles only: Next.js injects inline
// style attributes, and the app has no inline event handlers.
// Development needs eval and a websocket for hot reload, so the strict policy
// is production-only; dev keeps the same shape with those two allowances.
const development = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
  development
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  development ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
  "worker-src 'self' blob:",
  ...(development ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // Standalone output bundles a self-contained server for the Docker and
  // single-VM deployments. Vercel builds its own serverless output and traces
  // its own dependencies, and the two collide: leaving standalone on there
  // fails the build looking for .next/next-server.js.nft.json.
  output: process.env.VERCEL ? undefined : "standalone",
  // Lets a verification build run without disturbing a server already serving
  // .next. scripts/start.mjs reads the same variable.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
