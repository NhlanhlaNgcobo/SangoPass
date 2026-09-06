import type { PropertySummary } from "@/types";

/**
 * Sample data for previewing the Properties / Units / Rent screens.
 * Phase 2 replaces this with real Supabase queries — nothing here is persisted.
 */
export const SAMPLE_PROPERTIES: PropertySummary[] = [
  {
    id: "riverside-student-residence",
    name: "Riverside Student Residence",
    address: "12 Riverside Ave, Cape Town",
    units: [
      {
        id: "r-101",
        unitNumber: "Room 101",
        status: "occupied",
        tenantName: "Thabo M.",
        rentAmount: 3500,
        rentFrequency: "monthly",
        rentPaid: true,
      },
      {
        id: "r-102",
        unitNumber: "Room 102",
        status: "vacant",
        rentPaid: true,
      },
      {
        id: "r-103",
        unitNumber: "Room 103",
        status: "occupied",
        tenantName: "Lindiwe K.",
        rentAmount: 21000,
        rentFrequency: "per_semester",
        rentPaid: false,
        outstandingAmount: 21000,
      },
      {
        id: "r-104",
        unitNumber: "Room 104",
        status: "occupied",
        tenantName: "Sipho N.",
        rentAmount: 42000,
        rentFrequency: "annual",
        rentPaid: true,
      },
    ],
  },
  {
    id: "oakwood-apartments",
    name: "Oakwood Apartments",
    address: "45 Oak Street, Johannesburg",
    units: [
      {
        id: "u-4b",
        unitNumber: "Unit 4B",
        status: "occupied",
        tenantName: "Jane D.",
        rentAmount: 8500,
        rentFrequency: "monthly",
        rentPaid: false,
        outstandingAmount: 8500,
      },
      {
        id: "u-5a",
        unitNumber: "Unit 5A",
        status: "occupied",
        tenantName: "Mark R.",
        rentAmount: 9200,
        rentFrequency: "monthly",
        rentPaid: true,
      },
      {
        id: "u-6c",
        unitNumber: "Unit 6C",
        status: "vacant",
        rentPaid: true,
      },
    ],
  },
];
