import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPLE_MANAGE_URL, DELETION_SUBSCRIPTION_NOTICE, GOOGLE_MANAGE_URL } from "@/lib/billing/manage";

/**
 * The app's deletion screens name the stores' own subscription pages and the owner-approved notice. src/lib/billing
 * isn't a folder Metro shares (mobile/metro.shared.js), so mobile/lib/account/delete-screen.ts carries them; this keeps
 * them verbatim.
 */
describe("the apps name the same store pages and notice as the web", () => {
  const src = readFileSync(join(__dirname, "..", "..", "mobile", "lib", "account", "delete-screen.ts"), "utf8").replace(/\s+/g, " ");

  it("mobile/lib/account/delete-screen.ts carries the web's values verbatim", () => {
    expect(src).toContain(`export const APPLE_MANAGE_URL = ${JSON.stringify(APPLE_MANAGE_URL)};`);
    expect(src).toContain(`export const GOOGLE_MANAGE_URL = ${JSON.stringify(GOOGLE_MANAGE_URL)};`);
    expect(src).toContain(`export const DELETION_SUBSCRIPTION_NOTICE = ${JSON.stringify(DELETION_SUBSCRIPTION_NOTICE)};`);
  });
});
