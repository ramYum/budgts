import { afterEach, describe, expect, it, vi } from "vitest";

// React's cache() only memoizes inside a server render; stand in for that
// request scope with a plain once-per-test memo.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      let hit = false;
      let value: unknown;
      return ((...args: never[]) => {
        if (!hit) {
          hit = true;
          value = fn(...args);
        }
        return value;
      }) as T;
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({}) }));

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeRefresh", () => {
  // The listener drops realtime events that committed at or before
  // `renderedAt`, so the stamp must precede every query the render made —
  // otherwise a change committed between a query and a later stamp (e.g. the
  // last batch of a bank sync) is neither on screen nor refreshed for.
  it("stamps renderedAt when the render first opened a Supabase client, not when it renders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { createClient } = await import("@/lib/supabase/server");
    await createClient(); // the page's queries start here

    vi.setSystemTime(5_000); // ...and RealtimeRefresh renders after they finish
    const { RealtimeRefresh } = await import("./realtime-refresh");
    const el = RealtimeRefresh({ tables: ["transactions"] });

    expect(el.props.renderedAt).toBe(1_000);
  });
});
