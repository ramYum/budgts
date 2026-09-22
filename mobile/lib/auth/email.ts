/** Pure email helpers for the sign-in form. The server (Supabase) remains the
 * authority on validity; this only prevents an obviously bad or whitespace-
 * padded value (Android keyboards append a space after autocomplete) from
 * costing a round trip and a rate-limited email send. */
export function normalizeEmail(value: string): string {
  return value.trim();
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
