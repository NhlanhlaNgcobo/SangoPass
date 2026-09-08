import {
  CONTRACTOR_KINDS,
  TRADES,
  URGENCIES,
  type ContractorKind,
  type Urgency,
} from "@/lib/shared/maintenance";
import { AppError, choice, email, text } from "./validation";

export * from "@/lib/shared/maintenance";

export function parseUrgency(value: unknown): Urgency {
  return choice(value, URGENCIES, "urgency");
}

export interface ContractorInput {
  name: string;
  trade: string;
  company: string | null;
  phone: string;
  email: string | null;
  kind: ContractorKind;
  notes: string | null;
}

/**
 * A maintenance contact is a directory entry, not an account: nobody signs in
 * with it and it grants nothing. Only enough validation to keep the panel
 * usable at the moment a manager needs to phone somebody.
 */
export function parseContractor(
  input: Record<string, unknown>,
): ContractorInput {
  const phone = text(input.phone, "phone number", 30);
  if (!/^\+?[\d ()-]{9,25}$/.test(phone))
    throw new AppError("Enter a valid phone number.");
  const address =
    typeof input.email === "string" && input.email.trim()
      ? email(input.email)
      : null;
  const company =
    typeof input.company === "string" && input.company.trim()
      ? text(input.company, "company", 120)
      : null;
  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? text(input.notes, "notes", 500)
      : null;
  return {
    name: text(input.name, "name", 100),
    trade: choice(input.trade, TRADES, "trade"),
    company,
    phone,
    email: address,
    kind: choice(input.kind, CONTRACTOR_KINDS, "type"),
    notes,
  };
}
