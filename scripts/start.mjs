import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
// Must match distDir in next.config.ts.
const dist = resolve(process.env.NEXT_DIST_DIR || ".next");
// The standalone server deliberately excludes static assets from file tracing.
await cp(resolve("public"), resolve(dist, "standalone/public"), {
  recursive: true,
});
await cp(resolve(dist, "static"), resolve(dist, "standalone", ".next/static"), {
  recursive: true,
});
process.env.HOSTNAME ||= "0.0.0.0";
// Resolve storage before the standalone server changes its working directory.
process.env.SANGOPASS_DATABASE_PATH = resolve(
  process.env.SANGOPASS_DATABASE_PATH || "data/sangopass.sqlite",
);
await import(pathToFileURL(resolve(dist, "standalone/server.js")).href);
