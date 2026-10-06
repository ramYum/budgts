/**
 * POST /api/mobile/plaid/removed-held/answer — `{ transactionId, answer: "out" | "in" }`: Connected banks' "From removed
 * banks" question about held rows a disconnected bank left behind (card payments §5c). Adapter over
 * `resolveDetachedHeldFromAnswer`, shared with the web `answerDetachedHeldAction`; see `src/lib/mobile/sign-answer.ts`.
 */
import { answerRemovedBankHeld } from "@/lib/mobile/sign-answer";
import { mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute((ctx, request) => answerRemovedBankHeld(ctx, request, "answer"));
