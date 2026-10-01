import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { getVersion } from "../api/invalidate";
import { REFRESH_DEBOUNCE_MS } from "./coalescer";
import type { RealtimeTable } from "./topics";

/**
 * A realtime client that behaves like realtime-js 2.x where it matters: `channel(topic)` hands back the channel it
 * still holds for that topic, `.on()` after `subscribe()` throws, and `removeChannel` tears the channel down for everyone.
 */
const rt = vi.hoisted(() => {
  type Fake = { topic: string; subscribed: boolean; removed: boolean; handlers: (() => void)[] };
  const held = new Map<string, Fake>();
  const all: Fake[] = [];
  return {
    held,
    all,
    client: {
      channel(topic: string) {
        const existing = held.get(topic);
        if (existing) return (existing as Fake & { api: unknown }).api;
        const fake: Fake & { api?: unknown } = { topic, subscribed: false, removed: false, handlers: [] };
        const api = {
          fake,
          on(_type: string, _filter: unknown, cb: () => void) {
            if (fake.subscribed) throw new Error(`tried to add postgres_changes callbacks for '${topic}' after subscribe()`);
            fake.handlers.push(cb);
            return api;
          },
          subscribe() {
            fake.subscribed = true;
            return api;
          },
        };
        fake.api = api;
        held.set(topic, fake as Fake);
        all.push(fake as Fake);
        return api;
      },
      async removeChannel(api: { fake: Fake }) {
        api.fake.removed = true;
        await Promise.resolve(); // realtime-js unsubscribes first: the topic is still held meanwhile
        held.delete(api.fake.topic);
        return "ok";
      },
    },
  };
});

vi.mock("../supabase/client", () => ({ supabase: rt.client }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: { user: { id: "user-1" } } }) }));

const { useRealtimeRefresh } = await import("./use-realtime-refresh");

function Watcher({ tables }: { tables: RealtimeTable[] }) {
  useRealtimeRefresh(tables);
  return null;
}

const live = (table: string) => rt.all.filter((c) => c.topic.includes(`:${table}:`) && !c.removed);
const fire = (table: string) => {
  for (const c of live(table)) for (const h of c.handlers) h();
};

describe("useRealtimeRefresh: screens watching the same table", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("two mounted screens share one channel per table (no .on() after subscribe), and one leaving keeps the other live", () => {
    let home!: ReturnType<typeof render>;
    let budgets!: ReturnType<typeof render>;
    expect(() => {
      home = render(<Watcher tables={["budgets"]} />);
      budgets = render(<Watcher tables={["budgets"]} />);
    }).not.toThrow();
    const layout = render(<Watcher tables={["transactions"]} />);
    expect(live("budgets")).toHaveLength(1);
    expect(live("budgets")[0]!.handlers).toHaveLength(1);

    act(() => home.unmount());
    expect(live("budgets")).toHaveLength(1); // Budgets still hears its rows

    const before = getVersion("budgets");
    fire("budgets");
    act(() => void vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(getVersion("budgets")).toBe(before + 1); // one coalesced refresh

    act(() => budgets.unmount());
    expect(live("budgets")).toHaveLength(0); // the last one out closes it
    expect(live("transactions")).toHaveLength(1);
    act(() => layout.unmount());
    expect(live("transactions")).toHaveLength(0);
  });

  it("a screen leaving and coming back (StrictMode's double effect) opens a fresh channel, never the one being removed", () => {
    const first = render(<Watcher tables={["savings_goals", "savings_contributions"]} />);
    act(() => first.unmount());
    expect(() => render(<Watcher tables={["savings_goals", "savings_contributions"]} />)).not.toThrow();
    expect(live("savings_goals")).toHaveLength(1);
    expect(live("savings_contributions")).toHaveLength(1);
  });

  it("a burst on a two-table watch (Goals) bumps each topic once, after one quiet period", () => {
    const goals = render(<Watcher tables={["savings_goals", "savings_contributions"]} />);
    const [g, h] = [getVersion("goals"), getVersion("home")];
    fire("savings_goals");
    fire("savings_contributions");
    fire("savings_goals");
    act(() => void vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1));
    expect([getVersion("goals"), getVersion("home")]).toEqual([g, h]);
    act(() => void vi.advanceTimersByTime(1));
    expect([getVersion("goals"), getVersion("home")]).toEqual([g + 1, h + 1]);
    act(() => goals.unmount());
  });
});
