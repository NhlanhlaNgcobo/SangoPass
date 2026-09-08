import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, session, memberships } from "@/lib/server/auth";
import { workspace } from "@/lib/server/workspace";
import WorkspaceApp from "@/components/workspace/WorkspaceApp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function WorkspacePage() {
  const user = session((await cookies()).get(cookieName)?.value);
  if (!user) redirect("/login");
  if (!memberships(user.id).length)
    return (
      <main id="main-content" className="sp-shell" style={{ padding: 40 }}>
        <section className="sp-panel">
          <h1 style={{ fontSize: 28 }}>Your account is ready.</h1>
          <p style={{ marginTop: 16 }}>
            You do not currently belong to an organisation. Ask your property
            manager for a new invitation link, then accept it using your
            existing email and password.
          </p>
          <a className="sp-text-button" href="/login" style={{ marginTop: 20 }}>
            Back to sign in
          </a>
        </section>
      </main>
    );
  return <WorkspaceApp initial={workspace(user)} />;
}
