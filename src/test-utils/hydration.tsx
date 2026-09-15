import { act, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

// React's act() warns unless the environment opts in (Testing Library does this, but hydration
// tests don't need to import it).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Server-renders `element` under one environment, then hydrates that markup under another — the
 * way a Vercel (UTC) render meets a browser in the viewer's time zone. Returns every recoverable
 * error React reported during hydration (a text mismatch is React #418) and the settled text.
 *
 * `serverEnv` / `clientEnv` set process-wide state such as `process.env.TZ` or a `Date.now` spy;
 * the caller restores it.
 */
export async function hydrate(
  element: ReactElement,
  { serverEnv, clientEnv }: { serverEnv: () => void; clientEnv: () => void },
): Promise<{ errors: string[]; text: string }> {
  serverEnv();
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.appendChild(container);

  clientEnv();
  const errors: string[] = [];
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
    });
  });
  const text = container.textContent ?? "";

  act(() => root?.unmount());
  container.remove();
  return { errors, text };
}
