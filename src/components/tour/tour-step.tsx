import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { PrimaryLinkButton, SecondaryLinkButton } from "@/components/ui";
import { TOUR_TOPICS, getTopic, neighbors, type TourTopicId } from "@/lib/tour/topics";
import { CompleteTourButton } from "./complete-tour-button";

/**
 * One screen of the "How Budgts Works" walkthrough: the question, the agreed
 * answer, and (as `children`) the real product UI that shows it. Full-screen
 * and chrome-free so the first run isn't competing with the app's own nav.
 *
 * - Sequential: Back / Next.
 * - Individual: the numbered step list links straight to any explanation.
 * - Leaving: `firstRun` (tour not yet seen) completes the tour via the
 *   existing action; a revisit from Help/Settings just goes back to Help.
 */
export function TourStep({
  topicId,
  firstRun,
  children,
}: {
  topicId: TourTopicId;
  firstRun: boolean;
  children: ReactNode;
}) {
  const topic = getTopic(topicId)!;
  const { prev, next, index, total } = neighbors(topicId);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-bg px-4 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <Logo size={22} />
        {firstRun ? (
          <CompleteTourButton tone="text">Skip</CompleteTourButton>
        ) : (
          <Link href="/help" className="text-sm font-medium text-muted hover:text-text">
            Close
          </Link>
        )}
      </header>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">
          How Budgts Works · Step {index + 1} of {total}
        </p>
        <nav aria-label="Walkthrough steps">
          <ol className="flex gap-1.5">
            {TOUR_TOPICS.map((t, i) => (
              <li key={t.id} className="flex-1">
                <Link
                  href={`/tour/${t.id}`}
                  aria-label={`Step ${i + 1}: ${t.title}`}
                  aria-current={t.id === topicId ? "step" : undefined}
                  className="block py-2"
                >
                  <span
                    className={`block h-1.5 rounded-full ${i <= index ? "bg-accent" : "bg-track"}`}
                  />
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <section className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight text-heading">{topic.question}</h1>
        <p className="text-sm leading-relaxed text-muted">{topic.answer}</p>
      </section>

      {children}

      <footer className="mt-auto flex items-center justify-between gap-3 pt-2">
        {prev ? <SecondaryLinkButton href={`/tour/${prev}`}>Back</SecondaryLinkButton> : <span />}
        {next ? (
          <PrimaryLinkButton href={`/tour/${next}`} arrow>
            Next
          </PrimaryLinkButton>
        ) : firstRun ? (
          <CompleteTourButton>Finish — see my finances</CompleteTourButton>
        ) : (
          <PrimaryLinkButton href="/help">Done</PrimaryLinkButton>
        )}
      </footer>
    </div>
  );
}
