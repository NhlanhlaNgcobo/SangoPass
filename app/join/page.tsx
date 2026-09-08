import AuthForm from "@/components/workspace/AuthForm";
import { invitationDetails } from "@/lib/server/enrolment";
import Link from "next/link";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Activate your account | SangoPass",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token || "";
  const invitation = invitationDetails(token);
  if (!invitation)
    return (
      <main id="main-content" className="sp-shell" style={{ padding: 40 }}>
        <section className="sp-panel">
          <h1 style={{ fontSize: 28 }}>
            This invitation is no longer available.
          </h1>
          <p style={{ margin: "20px 0" }}>
            It may have expired, been replaced, or already been used. Ask your
            property administrator for a new enrolment email.
          </p>
          <Link className="sp-text-button" href="/tenant/login">
            Tenant sign in
          </Link>
        </section>
      </main>
    );
  return <AuthForm mode="join" token={token} invitation={invitation} />;
}
