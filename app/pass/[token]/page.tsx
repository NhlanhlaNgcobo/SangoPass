import { notFound } from "next/navigation";
import { now } from "@/lib/server/auth";
import { one } from "@/lib/server/db";
import GuestPass from "@/components/workspace/GuestPass";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your visitor pass | SangoPass",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function PassPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const pass = one<{
    visitorName: string;
    propertyName: string;
    reference: string;
    token: string;
    visitDate: string;
    arrival: string;
    departure: string;
    status: string;
  }>(
    "SELECT v.visitorName,p.name propertyName,v.reference,v.token,v.visitDate,v.arrival,v.departure,v.status FROM visitors v JOIN properties p ON p.id=v.propertyId WHERE v.token=?",
    token,
  );
  if (!pass) notFound();
  return (
    <GuestPass
      pass={pass}
      expired={
        Date.parse(`${pass.visitDate}T${pass.departure}:00+02:00`) <=
        Date.parse(now())
      }
    />
  );
}
