import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANK_SYNC_SUBSCRIPTION_MESSAGE } from "@/lib/billing/bank-sync-access";

describe("the apps say what the web says when bank sync needs a subscription", () => {
  it("mobile/lib/plaid/bank-sync-access.ts carries the web's BANK_SYNC_SUBSCRIPTION_MESSAGE verbatim", () => {
    const src = readFileSync(join(__dirname, "..", "..", "mobile", "lib", "plaid", "bank-sync-access.ts"), "utf8");
    expect(src).toContain(`export const BANK_SYNC_SUBSCRIPTION_MESSAGE = ${JSON.stringify(BANK_SYNC_SUBSCRIPTION_MESSAGE)};`);
  });
});
