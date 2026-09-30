/**
 * The Profile screen's lines from `GET /api/mobile/profile` (server source of truth:
 * `src/app/api/mobile/profile/route.ts`), which derives them with the very functions the web Profile page uses
 * (`displayName`, `signInMethods`, `timeZoneLabel`, `Intl.DisplayNames`), so the app never re-derives them.
 * Only the fields this screen shows are read; the rest of the body belongs to the app shell's profile.
 */
export type ProfileDetails = {
  email: string;
  /** "Alex" from alex.lee@…; empty when the email has no usable handle */
  displayName: string;
  /** "Email link", "Google", … in the session's own order */
  signInMethods: string[];
  currency: string;
  currencyName: string;
  /** "New York · Eastern Daylight Time"; null before onboarding stored a zone */
  timeZoneLabel: string | null;
};

export function parseProfileDetails(body: unknown): ProfileDetails {
  if (!body || typeof body !== "object") throw new Error("profile details: not an object");
  const b = body as Record<string, unknown>;
  const text = (key: string): string => {
    const v = b[key];
    if (typeof v !== "string") throw new Error(`profile details: ${key}`);
    return v;
  };
  if (b.email !== null && typeof b.email !== "string") throw new Error("profile details: email");
  const methods = b.signInMethods;
  if (!Array.isArray(methods) || methods.length === 0 || !methods.every((m) => typeof m === "string" && m.length > 0)) {
    throw new Error("profile details: signInMethods");
  }
  if (b.timeZoneLabel !== null && typeof b.timeZoneLabel !== "string") throw new Error("profile details: timeZoneLabel");
  const currency = text("currency");
  if (!currency) throw new Error("profile details: currency");
  return {
    email: (b.email as string | null) ?? "",
    displayName: text("displayName"),
    signInMethods: methods as string[],
    currency,
    currencyName: text("currencyName"),
    timeZoneLabel: b.timeZoneLabel as string | null,
  };
}

/** The web's "Signs in with …" line: "an email link or Google". */
export function signsInWith(methods: readonly string[]): string {
  return methods.map((m) => (m === "Email link" ? "an email link" : m)).join(" or ");
}

/** The avatar's letter: the name's, else the email's, else "?" (web Profile page). */
export function avatarLetter(details: Pick<ProfileDetails, "displayName" | "email">): string {
  return (details.displayName || details.email || "?")[0]!;
}
