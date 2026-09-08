import { redirect } from "next/navigation";

// The old /dashboard tree was a separate, browser-only mock of an earlier
// version of the product. The demo now runs the real workspace, so every
// bookmark and old link lands there instead of on a divergent copy.
export default function LegacyDashboardRedirect() {
  redirect("/demo");
}
