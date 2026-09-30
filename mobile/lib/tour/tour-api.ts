import { bool, int, list, obj, oneOf, str } from "../api/parse";
import { apiRequest } from "../api/request";
import { GUIDE_COPY, type TourStepId } from "./shared";

/**
 * The welcome guide's wire contracts (`GET /api/mobile/tour`, server `src/app/api/mobile/tour/route.ts`, cards from the
 * shared `src/lib/tour/load-tour.ts`). The server decides which cards show; the app only draws them.
 */

const STEP_IDS = Object.keys(GUIDE_COPY) as TourStepId[];

const stepIds = (v: unknown) => {
  const ids = list(v, "stepIds", (x) => oneOf(x, "stepId", STEP_IDS));
  if (ids.length === 0) throw new Error("stepIds: empty");
  return ids;
};

/** `?phase=onboarding`: the cards before the currency is chosen, and the cells in the whole guide. */
export type OnboardingCards = { stepIds: TourStepId[]; totalVisible: number };

export function parseOnboardingCards(body: unknown): OnboardingCards {
  const b = obj(body, "onboarding cards");
  const ids = stepIds(b.stepIds);
  const totalVisible = int(b.totalVisible, "totalVisible");
  if (totalVisible < ids.length) throw new Error("totalVisible: fewer than the cards");
  return { stepIds: ids, totalVisible };
}

/** `?phase=tour` (the default): the explainer cards, where they sit in the whole guide, and what they show. */
export type TourCards = {
  stepIds: TourStepId[];
  /** cards already shown before these (the onboarding ones, right after Get Started) */
  offset: number;
  totalVisible: number;
  currency: string;
  accounts: { id: string; name: string }[];
  seen: boolean;
};

export function parseTourCards(body: unknown): TourCards {
  const b = obj(body, "tour");
  const ids = stepIds(b.stepIds);
  const offset = int(b.offset, "offset");
  const totalVisible = int(b.totalVisible, "totalVisible");
  if (offset < 0 || totalVisible < offset + ids.length) throw new Error("tour: progress out of range");
  return {
    stepIds: ids,
    offset,
    totalVisible,
    currency: str(b.currency, "currency"),
    accounts: list(b.accounts, "accounts", (a) => {
      const o = obj(a, "account");
      return { id: str(o.id, "account.id"), name: str(o.name, "account.name") };
    }),
    seen: bool(b.seen, "seen"),
  };
}

export type CompleteTourResult = { status: "done" } | { status: "error"; kind: "auth" | "network" | "unavailable"; message: string };

const COMPLETE_MESSAGES = {
  auth: "Your session has expired. Please sign in again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  unavailable: "Something went wrong. Please try again.",
} as const;

/** `POST /api/mobile/tour`: the last card or Skip marks the guide seen. Safe to repeat. Never throws. */
export async function completeTour(fetcher: () => Promise<Response>): Promise<CompleteTourResult> {
  const r = await apiRequest(fetcher, (b) => {
    if (obj(b, "tour done").ok !== true) throw new Error("tour done: shape");
    return true;
  });
  if (r.ok) return { status: "done" };
  const kind = r.kind === "auth" || r.kind === "network" ? r.kind : "unavailable";
  return { status: "error", kind, message: COMPLETE_MESSAGES[kind] };
}
