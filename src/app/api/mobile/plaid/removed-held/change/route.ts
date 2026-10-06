/**
 * POST /api/mobile/plaid/removed-held/change — `{ transactionId, answer: "out" | "in" }`: "Change answer" for removed-bank
 * rows already answered (card payments §5c); a different answer flips exactly the rows the answer released. Adapter over
 * `changeDetachedHeldAnswer`, shared with the web `changeDetachedHeldAnswerAction`; see `src/lib/mobile/sign-answer.ts`.
 */
import { answerRemovedBankHeld } from "@/lib/mobile/sign-answer";
import { mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute((ctx, request) => answerRemovedBankHeld(ctx, request, "change"));
