/** A friendly first name from a sign-in email: its handle up to the first
 * separator, capitalised ("alex.lee+budgts@…" → "Alex"). Budgts keeps no
 * separate profile name, so the greeting, the sidebar and the profile all
 * read this one derivation. Empty when there's nothing usable. */
export function displayName(email: string | null | undefined): string {
  const handle = ((email ?? "").split("@")[0] ?? "").split(/[+._-]/)[0] ?? "";
  return handle ? `${handle[0]!.toUpperCase()}${handle.slice(1)}` : "";
}
