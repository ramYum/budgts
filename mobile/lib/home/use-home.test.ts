import { createElement } from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { invalidate } from "../api/invalidate";
import { homePath, useHome } from "./use-home";

const calls: string[] = [];
let respond: () => Promise<Response>;

vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: { access_token: "t" } }) }));
vi.mock("../auth/api", () => ({
  NotAuthenticatedError: class extends Error {},
  authFetch: (path: string) => {
    calls.push(path);
    return respond();
  },
}));

const body = {
  version: 1,
  month: "2026-09",
  today: "2026-09-19",
  currency: "USD",
  moneyLeft: 100,
  income: 200,
  spent: 100,
  budgeted: 0,
  leftToSpend: 0,
  savingsRate: 0.5,
  categories: [],
  recent: [],
  savings: null,
  bankConnected: null,
  suggestion: null,
  breakdown: [],
  trend: [],
  trendChange: { total: 100, delta: null, previousMonth: null },
};
const ok = () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const down = () => Promise.resolve(new Response("{}", { status: 503 }));

type Hook = ReturnType<typeof useHome>;
function mount(month: string | null) {
  const seen: Hook[] = [];
  function Probe({ m }: { m: string | null }) {
    seen.push(useHome(m));
    return null;
  }
  const r = render(createElement(Probe, { m: month }));
  return { r, seen, last: () => seen[seen.length - 1]!, Probe };
}
const settle = () => act(async () => {});

beforeEach(() => {
  calls.length = 0;
  respond = ok;
});

describe("useHome", () => {
  it("asks for the browsed month, or the user's own current month", () => {
    expect(homePath(null)).toBe("/api/mobile/home");
    expect(homePath("2026-08")).toBe("/api/mobile/home?month=2026-08");
  });

  it("loads once, then a save or sync reloads in place: no loading state, no pull indicator", async () => {
    const h = mount(null);
    await settle();
    expect(h.last().state.status).toBe("ready");
    const before = h.seen.length;
    await act(async () => invalidate("home"));
    await settle();
    expect(calls).toEqual(["/api/mobile/home", "/api/mobile/home"]);
    expect(h.seen.slice(before).map((s) => s.state.status)).not.toContain("loading");
    expect(h.seen.slice(before).some((s) => s.pulling)).toBe(false);
  });

  it("a failed pull keeps the numbers and reports a notice; a good one clears it", async () => {
    const h = mount(null);
    await settle();
    respond = down;
    await act(async () => h.last().pull());
    expect(h.last().state.status).toBe("ready");
    expect(h.last().notice).toMatch(/couldn't load/i);
    respond = ok;
    await act(async () => h.last().pull());
    expect(h.last().notice).toBeNull();
  });

  it("a reload after a save that fails shows the failure, never the old numbers as current", async () => {
    const h = mount(null);
    await settle();
    respond = down;
    await act(async () => invalidate("home"));
    await settle();
    expect(h.last().state.status).toBe("error");
  });

  it("the user's pull shows the indicator until it lands", async () => {
    const h = mount(null);
    await settle();
    let release!: () => void;
    respond = () => new Promise((res) => (release = () => res(new Response(JSON.stringify(body), { status: 200 }))));
    let done!: Promise<void>;
    act(() => {
      done = h.last().pull();
    });
    expect(h.last().pulling).toBe(true);
    await act(async () => {
      release();
      await done;
    });
    expect(h.last().pulling).toBe(false);
  });

  it("a new month loads in place: the shown month stays until the next lands", async () => {
    const h = mount(null);
    await settle();
    act(() => h.r.update(createElement(h.Probe, { m: "2026-08" })));
    expect(h.last().state.status).toBe("ready");
    await settle();
    expect(calls).toEqual(["/api/mobile/home", "/api/mobile/home?month=2026-08"]);
  });
});
