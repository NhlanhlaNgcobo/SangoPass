import { AppError } from "./validation";

/**
 * How a unit is described and how many people it may hold.
 *
 * Kept apart from the tenancy register in occupancy.ts, which records who
 * actually lived where: this is the manager's decision about a room, and that
 * is the history of the people in it.
 */

/** Nobody lets a flat to nobody, and nobody sleeps forty in one. */
export const OCCUPANT_BOUNDS: [number, number] = [1, 40];

/** A studio has none by this reckoning; 0 also means "nobody has said". */
export const BEDROOM_BOUNDS: [number, number] = [0, 20];

export interface UnitShape {
  bedrooms: number;
  maxOccupants: number;
}

/**
 * Reads the shape of a unit off the manager's form.
 *
 * Both numbers are the manager's to choose and neither is derived from the
 * other. Three sharers in a two-bedroom is an ordinary South African letting,
 * and so is a family of five in the same flat; a product that computed the
 * limit from the bedroom count would be arguing with the person who has been
 * inside the building.
 *
 * Omitting them is allowed and means "unchanged" on an edit, or the
 * single-occupant default on a new unit - which is what every unit created
 * before this existed already was.
 */
export function parseUnitShape(
  input: Record<string, unknown>,
  current: UnitShape = { bedrooms: 0, maxOccupants: 1 },
): UnitShape {
  const read = (
    value: unknown,
    fallback: number,
    [low, high]: [number, number],
    label: string,
  ) => {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < low || parsed > high)
      throw new AppError(
        `Enter a whole number between ${low} and ${high} for ${label}.`,
      );
    return parsed;
  };
  return {
    bedrooms: read(
      input.bedrooms,
      current.bedrooms,
      BEDROOM_BOUNDS,
      "bedrooms",
    ),
    maxOccupants: read(
      input.maxOccupants,
      current.maxOccupants,
      OCCUPANT_BOUNDS,
      "how many people may live here",
    ),
  };
}

/** How a unit's capacity reads on screen: "2 bedrooms · up to 3 people". */
export function describeShape(shape: UnitShape): string {
  const rooms =
    shape.bedrooms > 0
      ? `${shape.bedrooms} ${shape.bedrooms === 1 ? "bedroom" : "bedrooms"}`
      : "";
  const people = `up to ${shape.maxOccupants} ${
    shape.maxOccupants === 1 ? "person" : "people"
  }`;
  return rooms ? `${rooms} · ${people}` : people;
}

/**
 * Refuses an enrolment that would put more people in a unit than it holds.
 *
 * Invitations that have not been redeemed count, because they are somebody's
 * claim on a bed: without that, two invitations sent on the same evening both
 * pass the check and the second one to be accepted overfills the flat, at
 * which point the only remedy is asking a resident to leave.
 */
export function assertRoom(
  unit: { label: string; maxOccupants: number; occupants: number },
  pendingForUnit: number,
  wanted = 1,
) {
  const taken = unit.occupants + pendingForUnit;
  if (taken + wanted > unit.maxOccupants)
    throw new AppError(
      taken >= unit.maxOccupants
        ? `${unit.label} is full: it holds ${unit.maxOccupants} ${
            unit.maxOccupants === 1 ? "person" : "people"
          } and ${taken} ${taken === 1 ? "is" : "are"} already accounted for. Raise its limit from Properties, or choose another unit.`
        : `${unit.label} holds ${unit.maxOccupants} ${
            unit.maxOccupants === 1 ? "person" : "people"
          } and only ${unit.maxOccupants - taken} more can be enrolled.`,
      409,
    );
}
