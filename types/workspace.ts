export type MemberRole = "manager" | "tenant" | "security";
export interface Account {
  id: string;
  name: string;
  email: string;
}
export interface Membership {
  username: string | null;
  orgId: string;
  orgName: string;
  role: MemberRole;
  propertyId: string | null;
  unitId: string | null;
}
export interface LiveProperty {
  loginCode: string;
  id: string;
  orgId: string;
  name: string;
  address: string;
  type: "apartment" | "student_accommodation";
}
export interface LiveUnit {
  id: string;
  propertyId: string;
  label: string;
  rentCents: number;
  rentPaid: number;
  frequency: string;
  residentName: string | null;
}
export interface LiveMember {
  username: string | null;
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  propertyId: string | null;
  unitId: string | null;
}
export interface LiveVisitor {
  id: string;
  propertyId: string;
  hostId: string;
  visitorName: string;
  phone: string;
  reference: string;
  token: string;
  visitDate: string;
  arrival: string;
  departure: string;
  status: "upcoming" | "checked_in" | "checked_out" | "cancelled";
  createdAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  propertyName: string;
  hostName: string;
  unitLabel: string | null;
}
export interface LiveReport {
  id: string;
  propertyId: string;
  authorId: string;
  authorName: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
}
export interface LiveInvoice {
  id: string;
  plan: string;
  amountCents: number;
  status: string;
  createdAt: string;
}
export interface WorkspaceState {
  asOf: string;
  user: Account;
  memberships: Membership[];
  membership: Membership;
  organisation: {
    id: string;
    name: string;
    plan: string;
    trialUntil: string;
    paidUntil: string | null;
    active: boolean;
  };
  properties: LiveProperty[];
  units: LiveUnit[];
  members: LiveMember[];
  visitors: LiveVisitor[];
  reports: LiveReport[];
  invoices: LiveInvoice[];
  invitations: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    username: string | null;
    emailStatus: string;
    emailSentAt: string | null;
    propertyId: string | null;
    unitId: string | null;
  }[];
  billingConfigured: boolean;
  billingMode: "sandbox" | "live";
  emailConfigured: boolean;
}
