import { Robin } from "./mascot";
import { Badge, LinkButton, Stage } from "./ui";

/** A missing page: Crystal, curious, on her stage; what happened in plain
 * words; the two ways out (Home, or Help). */
export function NotFoundView() {
  return (
    <div className="space-y-6 md:max-w-[720px]">
      <Stage>
        <p className="px-figure-lg pl-1 tracking-[4px] text-ink" aria-hidden>
          404
        </p>
        <Robin mood="curious" size={88} />
        <span className="h-1 w-16 bg-hairline" aria-hidden />
      </Stage>
      <div className="space-y-2">
        <Badge tone="wash">Page not found</Badge>
        <h1 className="px-figure text-ink">This page flew the nest.</h1>
        <p className="text-base leading-6 text-muted">
          The link may be old or mistyped. Nothing&apos;s wrong with your data.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/" icon="home" size="lg">
          Go to Home
        </LinkButton>
        <LinkButton href="/help" variant="secondary" icon="help" size="lg">
          Get help
        </LinkButton>
      </div>
    </div>
  );
}
