import { notFound } from "next/navigation";
import { now } from "@/lib/server/auth";
import { store } from "@/lib/server/store";
import type { RegularRecord, VisitorRecord } from "@/lib/server/store";
import { endsAt, sastToday } from "@/lib/server/visits";
import { maskIdNumber } from "@/lib/shared/identity";
import GuestPass, {
  type GuestPassView,
} from "@/components/workspace/GuestPass";
import RegularPass, {
  type RegularPassView,
} from "@/components/workspace/RegularPass";
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
  const visit = await store().first<VisitorRecord>("visitors", {
    where: [["token", "==", token]],
  });
  // Both kinds of pass claim their token in one namespace, so exactly one of
  // these can answer. A worker holds a link that looks like a guest one and
  // behaves like a guest one; what it says is different because a standing
  // arrangement is different.
  if (!visit) {
    const regular = await store().first<RegularRecord>("regulars", {
      where: [["token", "==", token]],
    });
    if (!regular) notFound();
    const pass: RegularPassView = {
      personName: regular.personName,
      occupation: regular.occupation || "",
      employer: regular.employer || "",
      propertyName: regular.propertyName || "",
      unitLabel: regular.unitLabel ?? null,
      kind: (regular.kind || "staff") as RegularPassView["kind"],
      reference: regular.reference,
      token: regular.token,
      entryCode: regular.entryCode || "",
      idType: (regular.idType || "sa_id") as RegularPassView["idType"],
      idNumber: regular.idNumber ? maskIdNumber(regular.idNumber) : "",
      days: regular.days || "",
      fromTime: regular.fromTime || "",
      toTime: regular.toTime || "",
      startDate: regular.startDate,
      endDate: regular.endDate,
      revokedAt: regular.revokedAt ?? null,
    };
    return <RegularPass pass={pass} today={sastToday()} />;
  }

  // This page exists so the invited visitor can confirm they are on the
  // system. It deliberately omits the visitor's phone number, every host
  // account detail, and all but the last four characters of the identity
  // document, because the link is a capability that can be forwarded.
  const endDate = visit.endDate || visit.visitDate;
  const pass: GuestPassView = {
    visitorName: visit.visitorName,
    propertyName: visit.propertyName,
    reference: visit.reference,
    token: visit.token,
    entryCode: visit.entryCode || "",
    idType: visit.idType || "sa_id",
    idNumber: visit.idNumber ? maskIdNumber(visit.idNumber) : "",
    visitType: visit.visitType || "daily",
    visitDate: visit.visitDate,
    endDate,
    arrival: visit.arrival,
    departure: visit.departure,
    nights: visit.nights || 0,
    status: visit.status,
  };
  return (
    <GuestPass
      pass={pass}
      expired={
        endsAt({ endDate, departure: visit.departure }) <= Date.parse(now())
      }
    />
  );
}
