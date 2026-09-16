import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot";

/**
 * Shared full-screen card shell for the first-run tour (see
 * docs/specs/2026-09-15-first-run-tour-design.md). One card is visible at a
 * time; `TourWizard` swaps `children`/props as the step changes.
 */
export function TourCard({
  mood,
  heading,
  body,
  media,
  dotCount,
  dotIndex,
  primary,
  secondary,
  onBack,
  onSkip,
  footnote,
}: {
  mood: "normal" | "happy" | "curious" | "sleepy";
  heading: string;
  body?: ReactNode;
  /** Optional slot between the mascot and the heading — the purchase-icon
   * row, the connect-bank button, the currency select. */
  media?: ReactNode;
  dotCount: number;
  dotIndex: number;
  primary?: ReactNode;
  secondary?: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  footnote?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {onBack || onSkip ? (
        <div className="flex w-full items-center justify-between">
          {onBack ? (
            <button type="button" onClick={onBack} className="text-xs font-medium text-muted hover:text-text">
              ‹ Back
            </button>
          ) : (
            <span />
          )}
          {onSkip ? (
            <button type="button" onClick={onSkip} className="text-xs font-medium text-muted hover:text-text">
              Skip
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="brand-mascot-stage flex flex-col items-center gap-3 px-8 py-6">
        <Mascot mood={mood} size={120} />
      </div>

      <div className="space-y-2">
        <h1 id="tour-step-heading" tabIndex={-1} className="text-xl font-semibold outline-none">
          {heading}
        </h1>
        {body ? <p className="text-sm text-muted">{body}</p> : null}
      </div>

      {media ? <div className="w-full">{media}</div> : null}

      <div className="flex w-full flex-col items-center gap-2">
        {primary}
        {secondary}
      </div>

      {dotCount > 1 ? (
        <div className="flex items-center gap-1.5" role="presentation">
          {Array.from({ length: dotCount }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === dotIndex ? "w-4 bg-accent" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
      ) : null}

      {footnote ? <p className="text-xs text-muted">{footnote}</p> : null}
    </div>
  );
}
