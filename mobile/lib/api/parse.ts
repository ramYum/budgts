/**
 * Tiny runtime validators for wire contracts. Each throws on a mismatch, and `apiRequest` turns a throw into a `contract`
 * failure — so a response the app does not understand becomes a clear "please update the app" state, never a screen that guesses.
 *
 * Compatibility rule (docs/specs/2026-09-21-mobile-only-transition-design.md §4A): parsers ACCEPT fields they do not know, so a
 * server that adds a field never breaks an installed app. They only insist on the fields the app actually uses.
 */
export function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${what}: not an object`);
  return v as Record<string, unknown>;
}

export function str(v: unknown, what: string): string {
  if (typeof v !== "string") throw new Error(`${what}: not a string`);
  return v;
}

export function optStr(v: unknown, what: string): string | null {
  return v === null || v === undefined ? null : str(v, what);
}

/** Money is integer minor units on the wire: a fractional amount is a contract violation. */
export function int(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${what}: not an integer`);
  return v;
}

export function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what}: not a number`);
  return v;
}

export function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${what}: not a boolean`);
  return v;
}

export function list<T>(v: unknown, what: string, item: (x: unknown, index: number) => T): T[] {
  if (!Array.isArray(v)) throw new Error(`${what}: not a list`);
  return v.map(item);
}

export function oneOf<T extends string>(v: unknown, what: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new Error(`${what}: unexpected value`);
  return v as T;
}
