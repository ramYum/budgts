import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import s from "./guide.module.css";

/**
 * One card of the welcome guide (docs/specs/2026-09-25-welcome-guide-design.md):
 * back / progress / skip, the animated scene, Crystal's name tag, the heading
 * (rising word by word), her words, then the step's own form or actions.
 * Every part carries `.enter` with a cascade index, so the card arrives in
 * reading order from the direction of travel (see TourWizard).
 */
export function TourCard({
  heading,
  body,
  scene,
  media,
  dotCount,
  dotIndex,
  primary,
  secondary,
  onBack,
  onSkip,
  footnote,
}: {
  heading: string;
  body: string;
  /** The step's animated vignette (scenes.tsx). Decorative: aria-hidden. */
  scene: ReactNode;
  /** Optional slot below the words: the currency form, the connect-bank button. */
  media?: ReactNode;
  dotCount: number;
  dotIndex: number;
  primary?: ReactNode;
  secondary?: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  footnote?: ReactNode;
}) {
  const at = (i: number) => ({ "--i": i }) as CSSProperties;
  const quiet = "press inline-flex min-h-9 items-center gap-1 px-2 text-[13px] font-medium text-muted hover:text-ink";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5" data-testid="tour-card">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <span>
          {onBack ? (
            <button type="button" onClick={onBack} className={`${quiet} -ml-2`} data-testid="tour-back">
              <Icon name="chevron-left" size={12} />
              Back
            </button>
          ) : null}
        </span>
        <Progress count={dotCount} index={dotIndex} />
        <span className="flex justify-end">
          {onSkip ? (
            <button type="button" onClick={onSkip} className={`${quiet} -mr-2`} data-testid="tour-skip">
              Skip
            </button>
          ) : null}
        </span>
      </div>

      <div className={`${s.enter} px-card-raised`} style={at(0)} aria-hidden data-testid="tour-scene">
        <div className={`${s.sceneCard} px-dots h-[236px]`}>{scene}</div>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className={`${s.enter} flex items-center gap-2`} style={at(1)} data-testid="tour-name">
          <Robin size={14} />
          <span className="font-pixel-bold text-[8px] text-ink">CRYSTAL</span>
        </p>
        <h1
          id="tour-step-heading"
          data-testid="tour-heading"
          tabIndex={-1}
          className={`${s.heading} text-[26px] font-semibold leading-[1.15] tracking-tight text-heading`}
        >
          {heading.split(" ").map((word, i) => (
            <Fragment key={i}>
              {i > 0 ? " " : null}
              <span className={s.word} style={{ "--w": i } as CSSProperties} data-testid="tour-heading-word">
                {word}
              </span>
            </Fragment>
          ))}
        </h1>
        <p className={`${s.enter} max-w-[34ch] text-[15px] leading-relaxed text-muted`} style={at(3)} data-testid="tour-body">
          {body}
        </p>
      </div>

      {media ? (
        <div className={s.enter} style={at(4)} data-testid="tour-media">
          {media}
        </div>
      ) : null}

      {primary || secondary ? (
        <div className={`${s.enter} flex flex-col items-center gap-3`} style={at(5)}>
          {primary}
          {secondary}
        </div>
      ) : null}

      {footnote ? (
        <p className={`${s.enter} text-center text-xs text-muted`} style={at(6)} data-testid="tour-footnote">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

/** Where you are in the guide, as square cells: done in ink, now in red. */
function Progress({ count, index }: { count: number; index: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Welcome guide progress"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-valuetext={`Step ${index + 1} of ${count}`}
      className="flex items-center gap-[3px]"
      data-testid="tour-progress"
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-testid="tour-progress-cell" className={s.pcell} data-state={i < index ? "done" : i === index ? "now" : "todo"} />
      ))}
    </div>
  );
}
