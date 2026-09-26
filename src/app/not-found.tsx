import { NotFoundView } from "@/components/not-found-view";
import { StandaloneShell } from "@/components/standalone-shell";

/** A missing page outside the signed-in app. */
export default function NotFound() {
  return (
    <StandaloneShell>
      <NotFoundView />
    </StandaloneShell>
  );
}
