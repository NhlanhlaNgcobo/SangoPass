import { createHash } from "node:crypto";
import { store } from "./store";
import type { RateLimitRecord } from "./store";
import { AppError } from "./validation";

export const WINDOW_MS = 900000; // 15 minutes

export interface Bucket {
  key: string;
  limit: number;
}

const digest = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 40);

/**
 * Counts an attempt against every supplied bucket and rejects when any of them
 * is full.
 *
 * The buckets used to include platform-wide counters ("logins", 300 per 15
 * minutes) shared by every organisation, so one residence's morning sign-in
 * rush - or 300 requests from anyone at all - locked out the entire platform.
 * Callers now pass a narrow bucket (the account, the property, the caller's
 * address) plus a global backstop set far above any single tenant's traffic.
 */
export async function throttle(buckets: Bucket[]) {
  const now = Date.now();
  const resetsAt = now + WINDOW_MS;
  const ids = buckets.map((bucket) => digest(bucket.key));
  await store().tx(async (t) => {
    const existing = await Promise.all(
      ids.map((id) => t.get<RateLimitRecord>("rateLimits", id)),
    );
    const counts = existing.map((row) =>
      row && row.resetsAt > now ? row.count : 0,
    );
    const exceeded = counts.findIndex(
      (count, index) => count >= buckets[index].limit,
    );
    if (exceeded >= 0)
      throw new AppError(
        "Too many attempts. Please try again in 15 minutes.",
        429,
      );
    ids.forEach((id, index) => {
      const row = existing[index];
      const live = row && row.resetsAt > now;
      t.set("rateLimits", id, {
        count: counts[index] + 1,
        resetsAt: live ? row.resetsAt : resetsAt,
      });
    });
  });
}

/** Convenience for the single-bucket callers. */
export function bucket(key: string, limit: number): Bucket {
  return { key, limit };
}

/**
 * Backstops sized so no single organisation can consume them. They exist to
 * blunt a distributed script, not to cap a customer.
 */
export const BACKSTOPS = {
  logins: bucket("global:logins", 20000),
  registrations: bucket("global:registrations", 2000),
  resets: bucket("global:resets", 2000),
};

/** Removes windows that have already elapsed. Called by maintenance, not auth. */
export async function sweepRateLimits() {
  return store().removeWhere("rateLimits", {
    where: [["resetsAt", "<", Date.now()]],
  });
}
