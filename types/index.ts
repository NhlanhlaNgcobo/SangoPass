export type Role = "tenant" | "security" | "manager" | "admin";

export interface NavItem {
  label: string;
  href: string;
}

export type RentFrequency = "monthly" | "annual" | "per_semester";

export type UnitOccupancyStatus = "vacant" | "occupied";

export interface UnitSummary {
  id: string;
  unitNumber: string;
  status: UnitOccupancyStatus;
  tenantName?: string;
  rentAmount?: number;
  rentFrequency?: RentFrequency;
  rentPaid: boolean;
  outstandingAmount?: number;
}

export interface PropertySummary {
  id: string;
  name: string;
  address: string;
  units: UnitSummary[];
}

export type ReportCategory = "complaint" | "maintenance" | "suggestion";

export type ReportStatus = "open" | "in_progress" | "resolved";

export interface ReportEntry {
  id: string;
  category: ReportCategory;
  description: string;
  submittedBy: string;
  role: Role;
  location?: string;
  status: ReportStatus;
  createdAt: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  propertyName: string;
  unitNumber: string;
}

export interface StaffSummary {
  id: string;
  name: string;
  roleLabel: string;
  assignedPropertyName: string;
}

export type VisitorInvitationStatus =
  | "upcoming"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "expired";

export interface VisitorInvitation {
  id: string;
  referenceNumber: string;
  secureToken: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail?: string;
  vehicleRegistration?: string;
  reasonForVisit?: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  visitDate: string;
  expectedArrival: string;
  expectedDeparture: string;
  status: VisitorInvitationStatus;
  checkedInAt?: string;
  checkedOutAt?: string;
  createdAt: string;
}
