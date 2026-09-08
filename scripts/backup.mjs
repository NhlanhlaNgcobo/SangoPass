import { DatabaseSync, backup } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// SQLite backend only. On Firebase, backups are scheduled in Google Cloud:
// Firestore > Backups, or `gcloud firestore backups schedules create`.
const chosen = (process.env.SANGOPASS_BACKEND || "").toLowerCase();
if (chosen === "firebase" || chosen === "firestore") {
  console.error(
    "SANGOPASS_BACKEND is firebase: this script backs up the SQLite file only.\n" +
      "Configure Firestore backups in the Google Cloud console, or run:\n" +
      "  gcloud firestore backups schedules create --database='(default)' --retention=7d --recurrence=daily",
  );
  process.exit(1);
}

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
