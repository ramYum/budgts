import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import type { LoadState } from "../api/load";
import type { MobileTransaction, TransactionsPage } from "./transactions-api";
import { useLedger, type LedgerState } from "./use-ledger";

type Settled = Exclude<LoadState<TransactionsPage>, { status: "loading" }>;

/** Every request the hook makes waits here, by path, until the test answers it. */
const net = vi.hoisted(() => ({ asked: [] as { path: string; answer: (s: unknown) => void }[] }));

vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("../api/invalidate", () => ({ useVersion: () => 0 }));
vi.mock("../auth/api", () => ({ authFetch: async (path: string) => path }));
vi.mock("../api/load", () => ({
  loadResource: async (fetcher: () => Promise<string>) => {
    const path = await fetcher();
    return new Promise((answer) => net.asked.push({ path, answer }));
  },
}));

const t = (id: string) => ({ id }) as MobileTransaction;
const page = (ids: string[], nextCursor: string | null): Settled => ({ status: "ready", data: { month: "2026-09", items: ids.map(t), nextCursor } });
const fail = (kind: "network" | "rejected"): Settled => ({ status: "error", kind, message: kind === "network" ? "Couldn't reach Budgts." : "Budgts couldn't load this." });

function harness() {
  net.asked.length = 0;
  const seen: { state: LedgerState; refresh: () => Promise<void>; retryRest: () => Promise<void> }[] = [];
  function Probe() {
    const l = useLedger({ month: "2026-09", category: null });
    seen.push(l);
    return null;
  }
  const r = render(<Probe />);
  const now = () => seen.at(-1)!;
  async function answer(match: (path: string) => boolean, s: Settled) {
    await act(async () => {}); // let the hook's requests reach the network stand-in
    const i = net.asked.findIndex((a) => match(a.path));
    if (i < 0) throw new Error(`no pending request matching; pending: ${net.asked.map((a) => a.path).join(", ")}`);
    const [req] = net.asked.splice(i, 1);
    await act(async () => req!.answer(s));
  }
  return { r, now, answer };
}

const first = (p: string) => !p.includes("cursor=");
const at = (c: string) => (p: string) => p.includes(`cursor=${c}`);

describe("useLedger", () => {
  it("a refresh that fails while the rest of the month was still loading ends with Try again, never a stuck footer", async () => {
    const h = harness();
    await h.answer(first, page(["a"], "c1")); // first page shows; the rest is on its way
    expect(h.now().state).toMatchObject({ status: "ready", cursor: "c1", restError: null });
    await act(async () => void h.now().refresh()); // a pull (or a sync) supersedes the rest
    await h.answer(at("c1"), page(["b"], null)); // the superseded page lands: ignored
    await h.answer(first, fail("network")); // and the refresh fails
    expect(h.now().state).toMatchObject({ status: "ready", cursor: "c1", restError: "Couldn't reach Budgts." });
    const shown = h.now().state;
    expect(shown.status === "ready" ? shown.page.items.map((x) => x.id) : null).toEqual(["a"]);

    await act(async () => void h.now().retryRest()); // Try again resumes from where it stopped
    await h.answer(at("c1"), page(["b"], null));
    expect(h.now().state).toMatchObject({ status: "ready", cursor: null, restError: null });
  });

  it("a retry of the rest that is interrupted and then fails still offers Try again", async () => {
    const h = harness();
    await h.answer(first, page(["a"], "c1"));
    await h.answer(at("c1"), fail("network"));
    await act(async () => void h.now().retryRest());
    await act(async () => void h.now().refresh()); // interrupts the retry
    await h.answer(at("c1"), page(["b"], null)); // stale
    await h.answer(first, fail("network"));
    expect(h.now().state).toMatchObject({ status: "ready", cursor: "c1", restError: "Couldn't reach Budgts." });
  });

  it("a cursor the server refuses (422 invalid_cursor) starts the month over once, never an endless retry", async () => {
    const h = harness();
    await h.answer(first, page(["a"], "c1"));
    await h.answer(at("c1"), fail("rejected")); // e.g. a cursor from before a server change
    await h.answer(first, page(["a"], "c2")); // started over from the first page
    expect(h.now().state).toMatchObject({ status: "ready", cursor: "c2" });
    await h.answer(at("c2"), fail("rejected")); // refused again: say so instead of looping
    expect(h.now().state).toMatchObject({ status: "ready", cursor: "c2", restError: "Budgts couldn't load this." });
    expect(net.asked).toHaveLength(0);
  });
});
