/**
 * POST /api/mobile/plaid/sign-answer/change — `{ plaidAccountRowId, transactionId, answer: "out" | "in" }`: "Change
 * answer" (card payments §5a) and "Amounts on this account look reversed?" (§5b) on a resolved account; a different
 * answer flips its transaction format. Adapter over `changeSignConventionAnswer`, shared with the web
 * `changeSignAnswerAction`; see `src/lib/mobile/sign-answer.ts` for the wire.
 */
import { answerAccountSign } from "@/lib/mobile/sign-answer";
import { mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute((ctx, request) => answerAccountSign(ctx, request, "change"));
