import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
// The standalone server deliberately excludes static assets from file tracing.
await cp(resolve("public"), resolve(".next/standalone/public"), {
  recursive: true,
});
await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), {
  recursive: true,
});
process.env.HOSTNAME ||= "0.0.0.0";
// Resolve storage before the standalone server changes its working directory.
process.env.SANGOPASS_DATABASE_PATH = resolve(
  process.env.SANGOPASS_DATABASE_PATH || "data/sangopass.sqlite",
);
await import(pathToFileURL(resolve(".next/standalone/server.js")).href);
