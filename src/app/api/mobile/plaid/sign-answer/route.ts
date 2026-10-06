/**
 * POST /api/mobile/plaid/sign-answer — `{ plaidAccountRowId, transactionId, answer: "out" | "in" }`: Connected banks'
 * "Was this money going out or coming in?" about one held transaction (card payments §5). Resolves the account's
 * transaction format and releases its held rows. Adapter over `resolveSignConventionFromAnswer`, shared with the web
 * `answerSignCheckAction`; see `src/lib/mobile/sign-answer.ts` for the wire.
 */
import { answerAccountSign } from "@/lib/mobile/sign-answer";
import { mobileRoute } from "@/lib/mobile/route";

export const POST = mobileRoute((ctx, request) => answerAccountSign(ctx, request, "answer"));
