/**
 * DB-integration: getSignConventionEvidence / finalizeSignConvention against
 * budgts-staging Postgres. Synthetic fixtures only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import { cleanupUser, client, insertBankTxn, mainAccountId, seedUser } from "./_db";
import { db } from "./_db";

const store = createPlaidSyncStore(db);

let userId: string;
let accountId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
});

afterAll(async () => {
  await cleanupUser(userId);
});

async function readTxn(id: string) {
  const [row] = await client<
    { status: string; direction: string; pending_reason: string | null }[]
  >`select status, direction, pending_reason from public.transactions where id = ${id}`;
  return row;
}

describe("getSignConventionEvidence / finalizeSignConvention", () => {
  it("only finalizes rows pending for the sign-unknown reason, leaving a currency-mismatch row and an already-confirmed row untouched", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
    });
    const rowB = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "currency_mismatch",
      direction: "debit",
    });
    const rowC = await insertBankTxn(userId, accountId, {
      status: "confirmed",
      pendingReason: null,
      direction: "credit",
    });

    const evidence = await store.getSignConventionEvidence([accountId]);
    expect(evidence.get(accountId)).toEqual([{ rawAmount: 1, primary: "FOOD_AND_DRINK" }]); // only row A counts

    await store.finalizeSignConvention(accountId, "inverted");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("credit"); // flipped — convention resolved to inverted
    expect(a.pending_reason).toBeNull();

    const b = await readTxn(rowB);
    expect(b.status).toBe("pending_review"); // untouched — different pending reason
    expect(b.direction).toBe("debit");

    const c = await readTxn(rowC);
    expect(c.status).toBe("confirmed"); // untouched — was never pending
    expect(c.direction).toBe("credit");
  });

  it("leaves direction unchanged when the resolved convention is standard", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
    });

    await store.finalizeSignConvention(accountId, "standard");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("debit"); // unchanged
  });
});
