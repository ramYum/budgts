/**
 * The "How Budgts Works" walkthrough content — one entry per question.
 *
 * Single source of truth: the walkthrough pages AND the Help FAQ both render
 * from here, so the wording can never drift between them. Pure data + two
 * lookups, no React, no I/O.
 */

export type TourTopicId =
  | "organize"
  | "money-left"
  | "categorization"
  | "disconnect"
  | "excluded-account"
  | "connect-bank";

export type TourTopic = {
  id: TourTopicId;
  /** Short label for the topic list and progress. */
  title: string;
  question: string;
  answer: string;
};

export const TOUR_TOPICS: readonly TourTopic[] = [
  {
    id: "organize",
    title: "How Budgts organizes your money",
    question: "How does Budgts organize my money?",
    answer:
      "Connect a bank and Budgts imports and categorizes transactions automatically. You can also add anything by hand — cash, or accounts your bank can't reach.",
  },
  {
    id: "money-left",
    title: "What Money Left means",
    question: "What is Money Left?",
    answer:
      "Money Left is what's left after spending is subtracted from income for the month. It doesn't measure a savings-account balance — it's a snapshot of the month's flow.",
  },
  {
    id: "categorization",
    title: "How categorization works",
    question: "How does categorization work?",
    answer:
      "Budgts files obvious transactions automatically. When it isn't confident, it asks once — your answer is remembered for that merchant next time.",
  },
  {
    id: "disconnect",
    title: "Disconnecting a bank",
    question: "What happens if I disconnect a bank?",
    answer:
      "Disconnecting stops new transactions from syncing. Everything already imported stays in your history and keeps counting toward budgets, unless you explicitly choose to delete it.",
  },
  {
    id: "excluded-account",
    title: "Accounts excluded from totals",
    question: "Why is an account excluded from my totals?",
    answer:
      "Only you can exclude an account, and only after Budgts flags it for review — usually because its feed looked unreliable (e.g. duplicated activity). Exclusion never happens automatically.",
  },
  {
    id: "connect-bank",
    title: "Connecting a bank",
    question: "How do I connect a bank?",
    answer:
      "Pick your bank in the secure window and sign in there — your bank login goes to your bank, not to Budgts. Then choose which accounts to track, and your transactions start arriving on their own.",
  },
];

export function getTopic(id: string): TourTopic | undefined {
  return TOUR_TOPICS.find((t) => t.id === id);
}

export type TopicNeighbors = {
  prev: TourTopicId | null;
  next: TourTopicId | null;
  /** Zero-based position in the walkthrough. */
  index: number;
  total: number;
};

export function neighbors(id: TourTopicId): TopicNeighbors {
  const index = TOUR_TOPICS.findIndex((t) => t.id === id);
  return {
    prev: index > 0 ? TOUR_TOPICS[index - 1]!.id : null,
    next: index >= 0 && index < TOUR_TOPICS.length - 1 ? TOUR_TOPICS[index + 1]!.id : null,
    index,
    total: TOUR_TOPICS.length,
  };
}
