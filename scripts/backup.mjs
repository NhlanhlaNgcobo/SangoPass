import { DatabaseSync, backup } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const source = resolve(
  process.env.SANGOPASS_DATABASE_PATH || "data/sangopass.sqlite",
);
const directory = resolve("data/backups");
await mkdir(directory, { recursive: true });
const destination = resolve(
  directory,
  `sangopass-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, destination);
  console.log(`Database backup saved: ${destination}`);
} finally {
  database.close();
}
