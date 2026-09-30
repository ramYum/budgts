/**
 * Coalesces a burst of change events into one trailing refresh, the rule the
 * web's <RealtimeRefreshListener> follows: a bank sync lands hundreds of row
 * events at once, so each event restarts a quiet-period timer and only the
 * last one refreshes; while the app is in the background the refresh waits
 * until it is active again. No polling: it only ever reacts to events.
 */
export const REFRESH_DEBOUNCE_MS = 1500;

export type Coalescer = {
  /** a row changed */
  change: () => void;
  /** the app came to the foreground (true) or left it (false) */
  setActive: (active: boolean) => void;
  dispose: () => void;
};

export function createCoalescer(flush: () => void, { delayMs = REFRESH_DEBOUNCE_MS, active = true } = {}): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let isActive = active;

  const fire = () => {
    timer = null;
    if (!pending || !isActive) return; // resumed by setActive(true)
    pending = false;
    flush();
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, delayMs);
  };

  return {
    change() {
      pending = true;
      arm();
    },
    setActive(next) {
      isActive = next;
      if (next && pending && !timer) arm();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}
