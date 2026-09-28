import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { IconTile } from "@/components/ui";
import { LEGAL_PAGES } from "@/lib/legal/config";

/** A link inside running text: ink, always underlined (never color alone), the line darkening on hover. */
export const textLink =
  "font-medium text-ink underline decoration-silver decoration-1 underline-offset-4 hover:decoration-ink focus-visible:decoration-ink";

/** One reading paragraph on a legal page: Geist 15/24 in graphite, wrapping `pretty` on a phone. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-pretty text-[15px] leading-6 text-graphite">{children}</p>;
}

/** A list with square pixel bullets: the brand's cell, not a typographic dot. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="relative text-pretty pl-5 text-[15px] leading-6 text-graphite before:absolute before:left-1 before:top-[10px] before:h-1 before:w-1 before:bg-ink"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A short fact with its icon: the lead card's "short version" rows. */
export type KeyFact = { icon: IconName; title: string; body: string };

export function KeyFacts({ title, facts }: { title: string; facts: KeyFact[] }) {
  return (
    <section className="px-card-raised p-2 md:p-4" aria-labelledby="short-version">
      <h2 id="short-version" className="t-head mb-3 text-ink md:mb-4">
        {title}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 md:gap-x-6 md:gap-y-5">
        {facts.map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <IconTile name={f.icon} />
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-6 text-ink">{f.title}</p>
              <p className="text-pretty text-[13px] leading-5 text-muted">{f.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type LegalSection = { id: string; title: string; body: ReactNode };

/**
 * A legal document in the app's reading system: the pixel title and its "Last updated" date, an optional lead card, then
 * the sections on one white sheet divided by hairlines. From lg the section list stays beside the text, so a long
 * policy can be navigated without scrolling back up.
 */
export function LegalDoc({
  title,
  updated,
  intro,
  lead,
  sections,
}: {
  title: string;
  /** "Last updated October 1, 2026" */
  updated?: string;
  intro?: ReactNode;
  lead?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-12">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-10 space-y-3 pt-3">
          <p className="t-label-strong text-muted">On this page</p>
          <ol className="space-y-1.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="press block text-[13px] leading-5 text-muted hover:text-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="min-w-0 space-y-6 md:space-y-8">
        <header className="space-y-2">
          <h1 className="px-title text-ink">{title}</h1>
          {updated ? <p className="text-[13px] leading-5 text-muted">{updated}</p> : null}
          {intro ? <div className="pt-2">{intro}</div> : null}
        </header>

        {lead}

        <div className="px-card px-rows px-2 md:px-4">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-6 space-y-3 py-4 first:pt-2 last:pb-2 md:py-6 md:first:pt-4 md:last:pb-4">
              <h2 id={`${s.id}-title`} className="t-head text-ink">
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

/** The pages' shared footer: who publishes Budgts, and the four pages. */
export function LegalFooter({ entityName, year }: { entityName: string; year: number }) {
  return (
    <footer className="mx-auto flex w-full max-w-[1136px] flex-col gap-3 px-6 pb-10 pt-6 text-[13px] leading-5 text-muted md:flex-row md:items-center md:justify-between md:px-12">
      <p>
        © {year} {entityName}
      </p>
      <LegalLinks />
    </footer>
  );
}

/** Privacy · Terms · Support · Delete your account, quiet and underlined on hover. Rendered only while the pages are live. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-5">
        {LEGAL_PAGES.map(({ path, label }) => (
          <li key={path}>
            <Link href={path} className="press text-muted underline-offset-4 hover:text-ink hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A labelled way out to another place, e.g. an app store's subscription page. */
export function ExternalRow({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="press group flex items-center gap-4 py-2">
        <IconTile name={icon} />
        <span className="flex-1 text-[15px] font-medium leading-6 text-ink group-hover:underline">{label}</span>
        <Icon name="external" className="text-silver" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}
