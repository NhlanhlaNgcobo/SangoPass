export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function text(value: unknown, label: string, max = 180): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new AppError(`Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
}
export function email(value: unknown) {
  const result = text(value, "email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new AppError("Enter a valid email address.");
  return result;
}
export function password(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new AppError("Use a password between 12 and 128 characters.");
  return value;
}
export function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (!options.includes(value as T))
    throw new AppError(`Choose a valid ${label}.`);
  return value as T;
}
export function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000)
    throw new AppError("Enter an amount between R0 and R1,000,000.");
  return Math.round(amount * 100);
}
