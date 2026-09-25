import type { TourStepId } from "@/lib/tour/steps";

/** The welcome guide's words, one entry per step, shared by /onboarding and
 * /tour (docs/specs/2026-09-25-welcome-guide-design.md). Crystal, the robin,
 * narrates, so bodies are in her voice. Only shipped behavior is claimed. */
export type GuideCopy = {
  /** Announced to assistive tech as "Step n of m: label". */
  label: string;
  heading: string;
  body: string;
  /** The step's primary button label. */
  cta: string;
};

export const GUIDE_COPY: Record<TourStepId, GuideCopy> = {
  crystal: {
    label: "Meet Crystal",
    heading: "Hi, I'm Crystal.",
    body: "I'm the robin who looks after your money here. Give me a minute and I'll show you how Budgts works.",
    cta: "Nice to meet you",
  },
  welcome: {
    label: "What Budgts does",
    heading: "Budgeting that does itself.",
    body: "Budgts tracks what you spend, helps you plan what's next and shows your savings grow. You just live your life.",
    cta: "Show me how",
  },
  "auto-capture": {
    label: "Every purchase, tracked",
    heading: "Every purchase, tracked.",
    body: "Tap, swipe or shop online. Once your bank is connected, purchases show up on their own. No typing, no receipts.",
    cta: "Next",
  },
  currency: {
    label: "Your currency",
    heading: "Pick your currency.",
    body: "I'll show every amount in it, so choose the one you spend in.",
    cta: "Start budgeting",
  },
  bank: {
    label: "Connect your bank",
    heading: "Connect your bank.",
    body: "This is what makes tracking automatic. Your bank login is handled by Plaid and never reaches Budgts.",
    cta: "Connect a bank",
  },
  "auto-sort": {
    label: "Sorted for you",
    heading: "Sorted for you.",
    body: "I put each purchase in the right category. Not sure about one? I'll ask you once, then remember it.",
    cta: "Next",
  },
  "money-left": {
    label: "Know what's left",
    heading: "Know what's left.",
    body: "Home shows your Money Left: what came in this month minus what went out. It's the one number to check.",
    cta: "Next",
  },
  plan: {
    label: "Budgets and goals",
    heading: "Plan it. Then grow it.",
    body: "Give each category a monthly budget and watch it fill. Saving for something? Start a goal and add to it whenever you can.",
    cta: "Next",
  },
  done: {
    label: "You're all set",
    heading: "You're all set.",
    body: "Spend like normal. I'll keep track and show you where it all went.",
    cta: "See my finances",
  },
};
