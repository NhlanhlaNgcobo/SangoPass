import {
  limitsOf,
  monthBounds,
  nightsUsed,
  sastToday,
} from "@/lib/server/visits";
import { rank } from "@/lib/shared/maintenance";
import { addresses, levelRank, showing } from "@/lib/shared/announcements";
import { DEFAULT_THEME } from "@/lib/shared/theme";
import { currentPeriod, previousPeriod } from "@/lib/shared/money";
import { encodeEntryCode } from "@/lib/shared/passcode";
import type {
  LiveAnnouncement,
  LiveMovement,
  LiveRegular,
  LiveContractor,
  LiveDocument,
  LiveInvoice,
  LiveLedgerEntry,
  LiveMember,
  LiveProperty,
  LiveReport,
  LiveRequest,
  LiveTenancy,
  LiveUnit,
  LiveVisitor,
  WorkspaceState,
} from "@/types/workspace";

/**
 * A self-contained sample organisation, held in the browser.
 *
 * The demo runs the real workspace against this world instead of the API, so a
 * prospect sees the actual product and the actual rules - visitor limits, the
 * urgency queue, role scoping - without an account, a database or a backend.
 * Nothing here ever reaches a server, and a reload starts a fresh world.
 */
export const DEMO_ORG_ID = "demo-org";
export const DEMO_PASSWORD = "sangopass";

export type DemoRole = "manager" | "reception" | "tenant" | "security";

export interface DemoPersona {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  title: string;
  blurb: string;
  propertyId: string | null;
  unitId: string | null;
  username: string | null;
}

export interface DemoWorld {
  organisation: WorkspaceState["organisation"];
  properties: LiveProperty[];
  units: LiveUnit[];
  members: LiveMember[];
  visitors: LiveVisitor[];
  reports: LiveReport[];
  contractors: LiveContractor[];
  tenancies: LiveTenancy[];
  documents: LiveDocument[];
  requests: LiveRequest[];
  announcements: LiveAnnouncement[];
  regulars: LiveRegular[];
  movements: LiveMovement[];
  ledger: LiveLedgerEntry[];
  invoices: LiveInvoice[];
  invitations: WorkspaceState["invitations"];
  seq: number;
}

const COURT = "demo-property-court";
const CAMPUS = "demo-property-campus";

export const PERSONAS: DemoPersona[] = [
  {
    id: "demo-manager",
    name: "Nomsa Dlamini",
    email: "nomsa@ubuntuliving.demo",
    role: "manager",
    title: "Property manager",
    blurb: "Two properties, the maintenance queue, visitor limits and billing.",
    propertyId: null,
    unitId: null,
    username: null,
  },
  {
    id: "demo-reception",
    name: "Fatima Jacobs",
    email: "fatima@ubuntuliving.demo",
    role: "reception",
    title: "Reception",
    blurb:
      "One building, the front desk: residents, passes, notices and the filing cabinet. No money.",
    propertyId: COURT,
    unitId: null,
    username: null,
  },
  {
    id: "demo-resident",
    name: "Aisha Petersen",
    email: "aisha@ubuntuliving.demo",
    role: "tenant",
    title: "Resident",
    blurb: "Request a guest, give notice, see your allowance, log an issue.",
    propertyId: COURT,
    unitId: "demo-unit-a204",
    username: "SP-A204-7F2C91B4",
  },
  {
    id: "demo-guard",
    name: "Sibusiso Khumalo",
    email: "sibusiso@ubuntuliving.demo",
    role: "security",
    title: "Security",
    blurb: "Scan a pass, check arrivals in and out at Ubuntu Court.",
    propertyId: COURT,
    unitId: null,
    username: null,
  },
];

const day = (offset: number) =>
  new Date(Date.parse(`${sastToday()}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);

const stamp = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString();

// Deterministic-looking tokens: long enough to be realistic in a QR code, and
// obviously sample data on inspection.
const token = (n: number) =>
  (n.toString(16).padStart(4, "0") + "d3m0").repeat(8).slice(0, 64);

// The gate code a guest without a smartphone recites. Deterministic so a
// prospect who reloads the demo sees the same code they were just reading, and
// built through the shared encoder so it has exactly the shape the product
// issues. The engine draws from the same function for a pass booked in the
// demo, stepping past any code this seed already used.
export const demoGateCode = (n: number) =>
  encodeEntryCode([
    n & 255,
    (n * 37) & 255,
    (n * 91) & 255,
    (n * 13) & 255,
    (n >> 3) & 255,
  ]);

function unit(
  id: string,
  propertyId: string,
  label: string,
  rentCents: number,
  residentName: string | null = null,
  rentPaid = 1,
  archived = false,
  // A two-bedroom taking three sharers is an ordinary South African letting,
  // so the sample estate has one of those as well as single-occupant flats.
  bedrooms = 1,
  maxOccupants = 1,
  occupants = residentName ? 1 : 0,
): LiveUnit {
  return {
    id,
    propertyId,
    label,
    bedrooms,
    maxOccupants,
    occupants,
    rentCents,
    rentPaid,
    // A paid flag belongs to a month. The sample estate is paid up for the
    // month a prospect is looking at, so the money screen has something in it.
    rentPaidPeriod: rentPaid ? currentPeriod() : "",
    frequency: "monthly",
    residentName,
    // A demo needs one of everything, including a unit taken out of use, so
    // a prospect can see that archiving keeps history rather than deleting it.
    archivedAt: archived ? "2026-02-01T08:00:00.000Z" : null,
    archivedWithProperty: false,
  };
}

export function seedWorld(): DemoWorld {
  const properties: LiveProperty[] = [
    {
      id: COURT,
      orgId: DEMO_ORG_ID,
      name: "Ubuntu Court",
      address: "12 Bree Street, Cape Town",
      type: "apartment",
      loginCode: "ubuntu2026a",
      sleepoverNightsPerMonth: 8,
      maxConsecutiveNights: 3,
      maxActiveGuests: 2,
      archivedAt: null,
    },
    {
      id: CAMPUS,
      orgId: DEMO_ORG_ID,
      name: "Jacaranda Campus House",
      address: "88 Stiemens Street, Braamfontein",
      type: "student_accommodation",
      loginCode: "jacaranda26",
      sleepoverNightsPerMonth: 4,
      maxConsecutiveNights: 2,
      maxActiveGuests: 1,
      archivedAt: null,
    },
  ];

  const units: LiveUnit[] = [
    unit("demo-unit-a101", COURT, "A-101", 780000, "Thabo Molefe"),
    unit("demo-unit-a204", COURT, "A-204", 810000, "Aisha Petersen"),
    unit("demo-unit-a205", COURT, "A-205", 810000, null, 0),
    unit("demo-unit-b102", COURT, "B-102", 690000, "Riaan van Wyk", 0),
    unit("demo-unit-s01", CAMPUS, "S-01", 425000, "Lerato Mokoena"),
    unit("demo-unit-s02", CAMPUS, "S-02", 425000, "Yusuf Adams"),
    unit("demo-unit-s03", CAMPUS, "S-03", 425000, null, 0),
    // Out of use while the roof is replaced: it is not vacancy, it is not
    // owed, and it does not use up a unit on the plan.
    unit("demo-unit-b103", COURT, "B-103", 690000, null, 0, true),
  ];

  const members: LiveMember[] = [
    {
      id: "demo-manager",
      name: "Nomsa Dlamini",
      email: "nomsa@ubuntuliving.demo",
      role: "manager",
      propertyId: null,
      unitId: null,
      username: null,
    },
    {
      id: "demo-resident",
      name: "Aisha Petersen",
      email: "aisha@ubuntuliving.demo",
      role: "tenant",
      propertyId: COURT,
      unitId: "demo-unit-a204",
      username: "SP-A204-7F2C91B4",
    },
    {
      id: "demo-reception",
      name: "Fatima Jacobs",
      email: "fatima@ubuntuliving.demo",
      role: "reception",
      propertyId: COURT,
      unitId: null,
      username: null,
    },
    {
      id: "demo-guard",
      name: "Sibusiso Khumalo",
      email: "sibusiso@ubuntuliving.demo",
      role: "security",
      propertyId: COURT,
      unitId: null,
      username: null,
    },
    {
      id: "demo-thabo",
      name: "Thabo Molefe",
      email: "thabo@ubuntuliving.demo",
      role: "tenant",
      propertyId: COURT,
      unitId: "demo-unit-a101",
      username: "SP-A101-3B7E20DD",
    },
    {
      id: "demo-lerato",
      name: "Lerato Mokoena",
      email: "lerato@ubuntuliving.demo",
      role: "tenant",
      propertyId: CAMPUS,
      unitId: "demo-unit-s01",
      username: "20241187",
    },
    {
      id: "demo-yusuf",
      name: "Yusuf Adams",
      email: "yusuf@ubuntuliving.demo",
      role: "tenant",
      propertyId: CAMPUS,
      unitId: "demo-unit-s02",
      username: "20239954",
    },
  ];

  const visitors: LiveVisitor[] = [
    {
      id: "demo-visit-1",
      propertyId: COURT,
      unitId: "demo-unit-a204",
      hostId: "demo-resident",
      visitorName: "Lebo Ndlovu",
      phone: "+27 82 441 9087",
      visitorEmail: "lebo@example.co.za",
      idType: "sa_id",
      idNumber: "•••••••••9087",
      reference: "SP-4K7QP2M9XA",
      token: token(1),
      entryCode: demoGateCode(1),
      visitType: "daily",
      visitDate: day(0),
      endDate: day(0),
      arrival: "09:00",
      departure: "18:00",
      nights: 0,
      status: "checked_in",
      createdAt: stamp(-1),
      checkedInAt: stamp(-0.2),
      checkedOutAt: null,
      propertyName: "Ubuntu Court",
      hostName: "Aisha Petersen",
      unitLabel: "A-204",
    },
    {
      id: "demo-visit-2",
      propertyId: COURT,
      unitId: "demo-unit-a101",
      hostId: "demo-thabo",
      visitorName: "Karabo Sithole",
      phone: "+27 71 220 4413",
      visitorEmail: null,
      idType: "sa_id",
      idNumber: "•••••••••4413",
      reference: "SP-9WD3TB6RLE",
      token: token(2),
      entryCode: demoGateCode(2),
      visitType: "sleepover",
      visitDate: day(1),
      endDate: day(2),
      arrival: "18:30",
      departure: "08:00",
      nights: 1,
      status: "upcoming",
      createdAt: stamp(-0.5),
      checkedInAt: null,
      checkedOutAt: null,
      propertyName: "Ubuntu Court",
      hostName: "Thabo Molefe",
      unitLabel: "A-101",
    },
    {
      id: "demo-visit-3",
      propertyId: CAMPUS,
      unitId: "demo-unit-s01",
      hostId: "demo-lerato",
      visitorName: "Zanele Mahlangu",
      phone: "+27 63 887 1120",
      visitorEmail: "zanele@example.co.za",
      idType: "student_number",
      idNumber: "••••1120",
      reference: "SP-2CJ8RN5VQK",
      token: token(3),
      entryCode: demoGateCode(3),
      visitType: "extended_sleepover",
      visitDate: day(3),
      endDate: day(5),
      arrival: "17:00",
      departure: "09:30",
      nights: 2,
      status: "upcoming",
      createdAt: stamp(-2),
      checkedInAt: null,
      checkedOutAt: null,
      propertyName: "Jacaranda Campus House",
      hostName: "Lerato Mokoena",
      unitLabel: "S-01",
    },
    {
      id: "demo-visit-4",
      propertyId: COURT,
      unitId: "demo-unit-b102",
      hostId: "demo-riaan",
      visitorName: "Pieter Coetzee",
      phone: "+27 84 662 3390",
      visitorEmail: null,
      idType: "passport",
      idNumber: "••••3390",
      reference: "SP-7HM4XZ1PDW",
      token: token(4),
      entryCode: demoGateCode(4),
      visitType: "daily",
      visitDate: day(-2),
      endDate: day(-2),
      arrival: "10:00",
      departure: "16:00",
      nights: 0,
      status: "checked_out",
      createdAt: stamp(-3),
      checkedInAt: stamp(-2.3),
      checkedOutAt: stamp(-2.1),
      propertyName: "Ubuntu Court",
      hostName: "Riaan van Wyk",
      unitLabel: "B-102",
    },
  ];

  const reports: LiveReport[] = [
    {
      id: "demo-report-1",
      propertyId: COURT,
      authorId: "demo-thabo",
      authorName: "Thabo Molefe",
      category: "Maintenance",
      description:
        "Burst geyser in the ceiling above the A-101 bathroom. Water is coming through the light fitting and I have switched the power off at the board.",
      urgency: "emergency",
      status: "open",
      createdAt: stamp(-0.1),
      unitLabel: "A-101",
    },
    {
      id: "demo-report-2",
      propertyId: COURT,
      authorId: "demo-resident",
      authorName: "Aisha Petersen",
      category: "Security",
      description:
        "The pedestrian gate latch does not catch, so the gate stands open after everyone walks through.",
      urgency: "urgent",
      status: "in_progress",
      createdAt: stamp(-1.4),
      unitLabel: "A-204",
    },
    {
      id: "demo-report-3",
      propertyId: CAMPUS,
      authorId: "demo-lerato",
      authorName: "Lerato Mokoena",
      category: "Noise",
      description:
        "Music from the courtyard past midnight on Thursday and Friday. It is hard to study.",
      urgency: "normal",
      status: "open",
      createdAt: stamp(-3),
      unitLabel: "S-01",
    },
    {
      id: "demo-report-4",
      propertyId: COURT,
      authorId: "demo-resident",
      authorName: "Aisha Petersen",
      category: "Maintenance",
      description:
        "Passage light outside A-204 has been flickering for a week.",
      urgency: "low",
      status: "resolved",
      createdAt: stamp(-9),
      unitLabel: "A-204",
    },
  ];

  const contractors: LiveContractor[] = [
    {
      id: "demo-contact-1",
      name: "Sipho Ndlovu",
      trade: "Plumbing",
      company: "Ndlovu Plumbing CC",
      phone: "+27 82 555 1234",
      email: "sipho@ndlovuplumbing.demo",
      kind: "contractor",
      notes: "24-hour call-out. Geysers and burst pipes.",
    },
    {
      id: "demo-contact-2",
      name: "Anna Mokoena",
      trade: "Gardening",
      company: null,
      phone: "+27 83 771 0092",
      email: null,
      kind: "in_house",
      notes: "On site Tuesdays and Fridays.",
    },
    {
      id: "demo-contact-3",
      name: "Dev Naidoo",
      trade: "Electrical",
      company: "Naidoo Electrical",
      phone: "+27 71 404 8821",
      email: "dev@naidooelectrical.demo",
      kind: "contractor",
      notes: "Certificate of compliance work.",
    },
    {
      id: "demo-contact-4",
      name: "Johannes Botha",
      trade: "Gate & access",
      company: "Gatewise",
      phone: "+27 82 116 7745",
      email: "service@gatewise.demo",
      kind: "contractor",
      notes: null,
    },
  ];

  // Occupancy history. Every occupied unit has a current stay, and A-101 and
  // B-102 each carry a finished one, so the filing cabinet opens on the thing
  // it exists for: the tenant who left, and the papers they left behind.
  const nameOf = (id: string) =>
    id === COURT ? "Ubuntu Court" : "Ubuntu Campus Residence";
  const stay = (
    id: string,
    unitId: string,
    label: string,
    propertyId: string,
    residentId: string,
    residentName: string,
    residentEmail: string,
    username: string | null,
    startedAt: string,
    endedAt: string | null = null,
    endedReason = "",
  ): LiveTenancy => ({
    id,
    propertyId,
    propertyName: nameOf(propertyId),
    unitId,
    unitLabel: label,
    residentId,
    residentName,
    residentEmail,
    username,
    startedAt,
    endedAt,
    endedReason,
    current: endedAt === null,
  });

  const tenancies: LiveTenancy[] = [
    stay(
      "demo-stay-a204",
      "demo-unit-a204",
      "A-204",
      COURT,
      "demo-resident",
      "Aisha Petersen",
      "aisha@ubuntuliving.demo",
      "SP-A204-7F2C91B4",
      "2025-02-01T08:00:00.000Z",
    ),
    stay(
      "demo-stay-a101",
      "demo-unit-a101",
      "A-101",
      COURT,
      "demo-thabo",
      "Thabo Molefe",
      "thabo@ubuntuliving.demo",
      "SP-A101-3B7E20DD",
      "2024-11-01T08:00:00.000Z",
    ),
    stay(
      "demo-stay-s01",
      "demo-unit-s01",
      "S-01",
      CAMPUS,
      "demo-lerato",
      "Lerato Mokoena",
      "lerato@ubuntuliving.demo",
      "20241187",
      "2025-01-15T08:00:00.000Z",
    ),
    stay(
      "demo-stay-s02",
      "demo-unit-s02",
      "S-02",
      CAMPUS,
      "demo-yusuf",
      "Yusuf Adams",
      "yusuf@ubuntuliving.demo",
      "20239954",
      "2025-01-15T08:00:00.000Z",
    ),
    stay(
      "demo-stay-b102",
      "demo-unit-b102",
      "B-102",
      COURT,
      "demo-riaan",
      "Riaan van Wyk",
      "riaan@ubuntuliving.demo",
      "SP-B102-9C4A11FE",
      "2024-06-01T08:00:00.000Z",
    ),
    // The ones that ended. This is the "previous occupants" the register would
    // otherwise have forgotten the day their account was deleted.
    stay(
      "demo-stay-a101-old",
      "demo-unit-a101",
      "A-101",
      COURT,
      "demo-past-naledi",
      "Naledi Khoza",
      "naledi@ubuntuliving.demo",
      "SP-A101-1A55C7B0",
      "2023-03-01T08:00:00.000Z",
      "2024-10-25T08:00:00.000Z",
      "moved_out",
    ),
    stay(
      "demo-stay-a204-old",
      "demo-unit-a204",
      "A-204",
      COURT,
      "demo-past-daniel",
      "Daniel Sithole",
      "daniel@ubuntuliving.demo",
      "SP-A204-44E1B209",
      "2023-08-01T08:00:00.000Z",
      "2025-01-20T08:00:00.000Z",
      "moved_out",
    ),
  ];

  // The filing cabinet. No bytes here - the demo runs entirely in the
  // visitor's browser and stores nothing - so these describe documents that
  // cannot be downloaded, and the interface says so rather than pretending.
  const paper = (
    id: string,
    tenancyId: string,
    title: string,
    kind: LiveDocument["kind"],
    filename: string,
    bytes: number,
    uploadedAt: string,
  ): LiveDocument => {
    const source = tenancies.find((t) => t.id === tenancyId)!;
    return {
      id,
      propertyId: source.propertyId,
      propertyName: source.propertyName,
      unitId: source.unitId,
      unitLabel: source.unitLabel,
      tenancyId: source.id,
      residentId: source.residentId,
      residentName: source.residentName,
      title,
      kind,
      filename,
      mime: filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      bytes,
      uploadedAt,
      uploadedByName: "Nomsa Dlamini",
    };
  };

  const documents: LiveDocument[] = [
    paper(
      "demo-doc-1",
      "demo-stay-a204",
      "Lease agreement — A-204",
      "lease",
      "lease-a204-petersen.pdf",
      842_119,
      "2025-02-01T09:12:00.000Z",
    ),
    paper(
      "demo-doc-2",
      "demo-stay-a204",
      "Entry inspection",
      "inspection",
      "inspection-a204-in.pdf",
      431_880,
      "2025-02-01T10:04:00.000Z",
    ),
    paper(
      "demo-doc-3",
      "demo-stay-a101",
      "Lease agreement — A-101",
      "lease",
      "lease-a101-molefe.pdf",
      795_540,
      "2024-11-01T08:41:00.000Z",
    ),
    paper(
      "demo-doc-4",
      "demo-stay-s01",
      "Lease agreement — S-01",
      "lease",
      "lease-s01-mokoena.pdf",
      612_300,
      "2025-01-15T11:20:00.000Z",
    ),
    paper(
      "demo-doc-5",
      "demo-stay-a101-old",
      "Lease agreement — A-101 (2023)",
      "lease",
      "lease-a101-khoza.pdf",
      733_002,
      "2023-03-01T09:00:00.000Z",
    ),
    paper(
      "demo-doc-6",
      "demo-stay-a101-old",
      "Exit inspection and deposit",
      "inspection",
      "exit-a101-khoza.pdf",
      388_412,
      "2024-10-25T15:30:00.000Z",
    ),
    paper(
      "demo-doc-7",
      "demo-stay-a204-old",
      "Notice to vacate",
      "notice",
      "notice-a204-sithole.pdf",
      96_770,
      "2024-12-18T13:02:00.000Z",
    ),
    paper(
      "demo-doc-8",
      "demo-stay-b102",
      "Lease agreement — B-102",
      "lease",
      "lease-b102-vanwyk.pdf",
      701_244,
      "2024-06-01T08:15:00.000Z",
    ),
  ];

  // Notices waiting on the office, and one already answered.
  const requests: LiveRequest[] = [
    {
      id: "demo-request-1",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      unitId: "demo-unit-a101",
      unitLabel: "A-101",
      residentId: "demo-thabo",
      residentName: "Thabo Molefe",
      kind: "move_out",
      effectiveDate: day(30),
      details:
        "Taking a job in Gqeberha. I would like the exit inspection on the last Saturday if someone is available.",
      status: "open",
      createdAt: stamp(-2),
      decidedAt: null,
      decidedByName: "",
      decisionNote: "",
    },
    {
      id: "demo-request-2",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      unitId: "demo-unit-a204",
      unitLabel: "A-204",
      residentId: "demo-resident",
      residentName: "Aisha Petersen",
      kind: "unit_change",
      effectiveDate: day(60),
      details:
        "A-205 is empty and faces the courtyard. Happy to pay the difference in rent.",
      status: "acknowledged",
      createdAt: stamp(-6),
      decidedAt: stamp(-4),
      decidedByName: "Fatima Jacobs",
      decisionNote:
        "Holding A-205 until the end of the month while she decides.",
    },
    {
      id: "demo-request-3",
      propertyId: CAMPUS,
      propertyName: nameOf(CAMPUS),
      unitId: "demo-unit-s02",
      unitLabel: "S-02",
      residentId: "demo-yusuf",
      residentName: "Yusuf Adams",
      kind: "property_change",
      effectiveDate: day(60),
      details:
        "Transferring campuses next semester. Is there anything at Ubuntu Court?",
      status: "declined",
      createdAt: stamp(-21),
      decidedAt: stamp(-18),
      decidedByName: "Nomsa Dlamini",
      decisionNote:
        "Nothing free at Court until March. Ask again in the new year.",
    },
  ];

  // The board: what the office has told the buildings. One of each kind, so a
  // prospect switching roles sees the audience rule work rather than reading
  // about it - the guard sees the boom notice the residents do not, the
  // residents see the water and the AGM, and the manager sees all of it plus
  // the one that has already expired.
  const announcements: LiveAnnouncement[] = [
    {
      id: "demo-announcement-1",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      title: "Water off Tuesday, 09:00 to 15:00",
      body: "The municipality is replacing the main on Ubuntu Street. Please store drinking water on Monday night. The pressure will be low for an hour or so after it comes back.",
      level: "important",
      audience: "everyone",
      showUntil: day(3),
      publishedAt: stamp(-1),
      editedAt: null,
      authorName: "Fatima Jacobs",
      archivedAt: null,
    },
    {
      id: "demo-announcement-2",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      title: "Vehicle boom out of order — use the side gate",
      body: "The boom motor has failed and the part arrives Thursday. Open the side gate by hand for residents and check every visitor pass on the tablet before letting a car through.",
      level: "urgent",
      audience: "security",
      showUntil: day(4),
      publishedAt: stamp(-0.2),
      editedAt: null,
      authorName: "Nomsa Dlamini",
      archivedAt: null,
    },
    {
      id: "demo-announcement-3",
      propertyId: null,
      propertyName: "",
      title: "Annual general meeting — 12 November, 18:00",
      body: "Both buildings, in the Ubuntu Court courtyard. The levy proposal for next year will be tabled and voted on. Proxy forms are with reception.",
      level: "routine",
      audience: "residents",
      showUntil: day(45),
      publishedAt: stamp(-9),
      editedAt: stamp(-7),
      authorName: "Nomsa Dlamini",
      archivedAt: null,
    },
    {
      id: "demo-announcement-4",
      propertyId: CAMPUS,
      propertyName: nameOf(CAMPUS),
      title: "Fibre installation finished",
      body: "All rooms are connected. Collect your router and network key from the house parent.",
      level: "routine",
      audience: "residents",
      showUntil: day(-4),
      publishedAt: stamp(-20),
      editedAt: null,
      authorName: "Nomsa Dlamini",
      archivedAt: null,
    },
  ];

  // The people who work here. One of each kind, so a prospect switching to
  // the guard sees the three shapes the pass takes: the estate's own cleaner
  // on weekdays, an outside contractor on a short job, and a resident's
  // domestic worker attached to one door.
  const regulars: LiveRegular[] = [
    {
      id: "demo-regular-1",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      unitId: null,
      unitLabel: null,
      personName: "Grace Mthembu",
      occupation: "Cleaner",
      employer: "",
      phone: "+27 82 555 0111",
      kind: "staff",
      idType: "sa_id",
      idNumber: "••••••••• 5087",
      reference: "SP-GRACE00001",
      token: token(9101),
      entryCode: demoGateCode(9101),
      days: "1111100",
      fromTime: "06:30",
      toTime: "15:00",
      startDate: day(-120),
      endDate: day(180),
      revokedAt: null,
      revokedByName: "",
      issuedByName: "Nomsa Dlamini",
      createdAt: stamp(-120),
    },
    {
      id: "demo-regular-2",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      unitId: null,
      unitLabel: null,
      personName: "Johan Pretorius",
      occupation: "Site foreman",
      employer: "Cape Roofing CC",
      phone: "+27 83 555 0122",
      kind: "contractor",
      idType: "sa_id",
      idNumber: "••••••••• 3081",
      reference: "SP-ROOF000002",
      token: token(9102),
      entryCode: demoGateCode(9102),
      days: "1111110",
      fromTime: "07:00",
      toTime: "17:30",
      startDate: day(-9),
      endDate: day(12),
      revokedAt: null,
      revokedByName: "",
      issuedByName: "Fatima Jacobs",
      createdAt: stamp(-9),
    },
    {
      id: "demo-regular-3",
      propertyId: COURT,
      propertyName: nameOf(COURT),
      unitId: "demo-unit-a204",
      unitLabel: "A-204",
      personName: "Nomvula Sithole",
      occupation: "Domestic worker",
      employer: "",
      phone: "+27 71 555 0133",
      kind: "household",
      idType: "sa_id",
      idNumber: "••••••••• 8083",
      reference: "SP-HOUSE00003",
      token: token(9103),
      entryCode: demoGateCode(9103),
      days: "1010100",
      fromTime: "08:00",
      toTime: "16:00",
      startDate: day(-200),
      endDate: day(90),
      revokedAt: null,
      revokedByName: "",
      issuedByName: "Nomsa Dlamini",
      createdAt: stamp(-200),
    },
  ];

  // A few mornings of arrivals, with one person still on site right now so the
  // gate register opens on the question it exists to answer.
  const movements: LiveMovement[] = [
    {
      id: "demo-movement-1",
      propertyId: COURT,
      regularId: "demo-regular-1",
      personName: "Grace Mthembu",
      occupation: "Cleaner",
      unitLabel: null,
      date: sastToday(),
      inAt: stamp(-0.2),
      outAt: null,
      inByName: "Sibusiso Khumalo",
      outByName: "",
    },
    {
      id: "demo-movement-2",
      propertyId: COURT,
      regularId: "demo-regular-2",
      personName: "Johan Pretorius",
      occupation: "Site foreman",
      unitLabel: null,
      date: day(-1),
      inAt: stamp(-1.3),
      outAt: stamp(-1.05),
      inByName: "Sibusiso Khumalo",
      outByName: "Sibusiso Khumalo",
    },
    {
      id: "demo-movement-3",
      propertyId: COURT,
      regularId: "demo-regular-3",
      personName: "Nomvula Sithole",
      occupation: "Domestic worker",
      unitLabel: "A-204",
      date: day(-2),
      inAt: stamp(-2.35),
      outAt: stamp(-2.05),
      inByName: "Sibusiso Khumalo",
      outByName: "Fatima Jacobs",
    },
  ];

  // Two months of books, so a prospect opening Money sees a working set of
  // accounts rather than an empty screen, and can page back to a closed month.
  // Rent receipts are not seeded: they are produced by the rent register, and
  // viewFor derives them from the units the same way the server does.
  const costs: [
    string,
    LiveLedgerEntry["category"],
    LiveLedgerEntry["nature"],
    number,
    string,
    string,
  ][] = [
    [
      "this",
      "security",
      "fixed",
      650000,
      "Guarding contract — night shift",
      COURT,
    ],
    ["this", "staff", "fixed", 520000, "Cleaners and gardener wages", COURT],
    [
      "this",
      "utilities",
      "variable",
      389450,
      "Municipal water and electricity",
      COURT,
    ],
    [
      "this",
      "maintenance",
      "variable",
      185000,
      "Geyser replacement, A-204",
      COURT,
    ],
    ["this", "other", "fixed", 140000, "Building insurance", COURT],
    ["this", "security", "fixed", 240000, "Campus access control", CAMPUS],
    ["this", "utilities", "variable", 160000, "Electricity", CAMPUS],
    [
      "last",
      "security",
      "fixed",
      650000,
      "Guarding contract — night shift",
      COURT,
    ],
    ["last", "staff", "fixed", 520000, "Cleaners and gardener wages", COURT],
    [
      "last",
      "utilities",
      "variable",
      352800,
      "Municipal water and electricity",
      COURT,
    ],
    ["last", "maintenance", "variable", 96000, "Blocked drain, B-101", COURT],
  ];
  // Every unit marked paid has a receipt, because that is exactly what
  // marking it paid does on the server: the register writes into the books.
  // Without these the money screen would show four units paid and nothing
  // collected, which is the one thing the screen exists to reconcile.
  const receipts: LiveLedgerEntry[] = units
    .filter((u) => u.residentName && u.rentPaid)
    .map((u, index) => ({
      id: `demo-rent-${index + 1}`,
      period: currentPeriod(),
      kind: "income" as const,
      category: "rent" as const,
      nature: "fixed" as const,
      amountCents: u.rentCents,
      description: `Rent received — ${u.label}`,
      propertyId: u.propertyId,
      propertyName:
        u.propertyId === COURT ? "Ubuntu Court" : "Jacaranda Campus House",
      unitId: u.id,
      unitLabel: u.label,
      recordedBy: "Nomsa Dlamini",
      createdAt: stamp(-6),
    }));

  const ledger: LiveLedgerEntry[] = costs
    .map<LiveLedgerEntry>(
      (
        [when, category, nature, amountCents, description, propertyId],
        index,
      ) => ({
        id: `demo-ledger-${index + 1}`,
        period:
          when === "this" ? currentPeriod() : previousPeriod(currentPeriod()),
        kind: "expense" as const,
        category,
        nature,
        amountCents,
        description,
        propertyId,
        propertyName:
          propertyId === COURT ? "Ubuntu Court" : "Ubuntu Campus Residence",
        unitId: null,
        unitLabel: null,
        recordedBy: "Nomsa Dlamini",
        createdAt: stamp(when === "this" ? -3 : -34),
      }),
    )
    .concat(receipts);

  return {
    organisation: {
      id: DEMO_ORG_ID,
      // No logo: the demo stores nothing, so there is nowhere to have put one.
      // The sample estate wears the SangoPass mark and the panel says why.
      logoUpdatedAt: "",
      name: "Ubuntu Living",
      plan: "growth",
      trialUntil: stamp(-30),
      paidUntil: stamp(19),
      active: true,
      activePlan: "growth",
      suspended: false,
      theme: { ...DEFAULT_THEME },
    },
    properties,
    units,
    members,
    visitors,
    reports,
    contractors,
    tenancies,
    documents,
    requests,
    announcements,
    regulars,
    movements,
    ledger,
    invoices: [
      {
        id: "demo-invoice-1",
        plan: "growth",
        amountCents: 149900,
        status: "paid",
        createdAt: stamp(-11),
      },
      {
        id: "demo-invoice-2",
        plan: "growth",
        amountCents: 149900,
        status: "paid",
        createdAt: stamp(-41),
      },
    ],
    invitations: [
      {
        id: "demo-invitation-1",
        email: "newresident@example.co.za",
        role: "tenant",
        expiresAt: stamp(5),
        username: "SP-A205-91DE4C0A",
        emailStatus: "sent",
        emailSentAt: stamp(-2),
        propertyId: COURT,
        unitId: "demo-unit-a205",
      },
    ],
    seq: 1,
  };
}

/**
 * Derives the state one persona sees, applying exactly the scoping rules the
 * server applies in lib/server/workspace.ts. Switching roles in the demo shows
 * real isolation, not a different set of fixtures.
 */
export function viewFor(
  world: DemoWorld,
  persona: DemoPersona,
): WorkspaceState {
  const isManager = persona.role === "manager";
  const isSecurity = persona.role === "security";
  // Reception runs one building. Everything below that treats it like a
  // manager narrows to its property, which is the whole of the difference.
  const isOffice = isManager || persona.role === "reception";
  const here = <T extends { propertyId: string | null }>(rows: T[]) =>
    isManager ? rows : rows.filter((r) => r.propertyId === persona.propertyId);

  const properties = isManager
    ? world.properties
    : world.properties.filter((p) => p.id === persona.propertyId);

  const units = isSecurity
    ? []
    : isManager
      ? world.units
      : isOffice
        ? world.units.filter((u) => u.propertyId === persona.propertyId)
        : world.units.filter((u) => u.id === persona.unitId);

  const visitors = isOffice
    ? here(world.visitors)
    : isSecurity
      ? world.visitors.filter((v) => v.propertyId === persona.propertyId)
      : world.visitors.filter((v) => v.hostId === persona.id);

  const reports = isOffice
    ? here(world.reports)
    : isSecurity
      ? world.reports.filter((r) => r.propertyId === persona.propertyId)
      : world.reports.filter((r) => r.authorId === persona.id);

  const tenancies = isOffice
    ? here(world.tenancies)
    : isSecurity
      ? []
      : world.tenancies.filter((t) => t.residentId === persona.id);

  const documents = isOffice
    ? here(world.documents)
    : isSecurity
      ? []
      : world.documents.filter((d) => d.residentId === persona.id);

  const requests = isOffice
    ? here(world.requests)
    : isSecurity
      ? []
      : world.requests.filter((r) => r.residentId === persona.id);

  // The board reaches everybody, including the gate. An announcement with no
  // property is the whole organisation's, so it survives the narrowing to a
  // building; the office reads its own board whole, expired entries included,
  // and everyone else gets only what is up and addressed to them. The same two
  // shared functions the server filters with, so the demo cannot show a
  // prospect a rule the product does not have.
  const today = sastToday();
  const board = isManager
    ? world.announcements
    : world.announcements.filter(
        (a) => a.propertyId === null || a.propertyId === persona.propertyId,
      );
  const announcements = isOffice
    ? board
    : board.filter(
        (a) => showing(a, today) && addresses(a.audience, persona.role),
      );

  // Who works here. The gate reads its own building's; a resident reads only
  // the household worker attached to their own door, because the estate's
  // staff list is not a tenancy's business.
  const regulars = isManager
    ? world.regulars
    : persona.role === "tenant"
      ? world.regulars.filter((r) => r.unitId === persona.unitId)
      : world.regulars.filter((r) => r.propertyId === persona.propertyId);

  // And who came and went. A resident gets none of it.
  const movements =
    persona.role === "tenant"
      ? []
      : isManager
        ? world.movements
        : world.movements.filter((mv) => mv.propertyId === persona.propertyId);

  let allowance: WorkspaceState["allowance"] = null;
  if (persona.role === "tenant" && persona.unitId && persona.propertyId) {
    const limits = limitsOf(
      world.properties.find((p) => p.id === persona.propertyId) || {},
    );
    const month = monthBounds(sastToday());
    const mine = world.visitors.filter((v) => v.unitId === persona.unitId);
    allowance = {
      month: month.start.slice(0, 7),
      activeGuests: mine.filter(
        (v) => v.status === "upcoming" || v.status === "checked_in",
      ).length,
      nightsUsed: nightsUsed(
        mine.filter(
          (v) => v.visitDate >= month.start && v.visitDate <= month.end,
        ),
      ),
      ...limits,
    };
  }

  return {
    asOf: new Date().toISOString(),
    user: { id: persona.id, name: persona.name, email: persona.email },
    memberships: [
      {
        orgId: DEMO_ORG_ID,
        orgName: world.organisation.name,
        role: persona.role,
        propertyId: persona.propertyId,
        unitId: persona.unitId,
        username: persona.username,
      },
    ],
    membership: {
      orgId: DEMO_ORG_ID,
      orgName: world.organisation.name,
      role: persona.role,
      propertyId: persona.propertyId,
      unitId: persona.unitId,
      username: persona.username,
    },
    organisation: world.organisation,
    properties,
    units: [...units].sort((a, b) => a.label.localeCompare(b.label)),
    members: isOffice
      ? [...here(world.members)].sort((a, b) => a.name.localeCompare(b.name))
      : [],
    visitors: [...visitors].sort(
      (a, b) =>
        b.visitDate.localeCompare(a.visitDate) ||
        b.arrival.localeCompare(a.arrival),
    ),
    reports: [...reports].sort(
      (a, b) =>
        rank(a.urgency) - rank(b.urgency) ||
        b.createdAt.localeCompare(a.createdAt),
    ),
    contractors: isOffice
      ? [...world.contractors].sort((a, b) => a.name.localeCompare(b.name))
      : [],
    tenancies: [...tenancies].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    ),
    documents: [...documents].sort((a, b) =>
      b.uploadedAt.localeCompare(a.uploadedAt),
    ),
    requests: [...requests].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
    regulars: [...regulars].sort((a, b) =>
      a.personName.localeCompare(b.personName),
    ),
    movements: [...movements].sort((a, b) => b.inAt.localeCompare(a.inAt)),
    announcements: [...announcements].sort(
      (a, b) =>
        levelRank(a.level) - levelRank(b.level) ||
        b.publishedAt.localeCompare(a.publishedAt),
    ),
    // The books never leave the manager, in the demo exactly as on the server.
    ledger: isManager
      ? [...world.ledger].sort(
          (a, b) =>
            b.period.localeCompare(a.period) ||
            b.createdAt.localeCompare(a.createdAt),
        )
      : [],
    invoices: isManager ? world.invoices : [],
    invitations: isOffice ? world.invitations : [],
    allowance,
    billingConfigured: false,
    billingMode: "sandbox",
    emailConfigured: false,
    backend: "sqlite",
  };
}
