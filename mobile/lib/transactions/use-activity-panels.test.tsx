import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { useActivityPanels } from "./use-activity-panels";

/** Each read waits here, by path, until the test answers it; the transactions topic's version is the test's to bump. */
const net = vi.hoisted(() => ({ asked: [] as { path: string; answer: (s: unknown) => void }[], version: 0 }));

vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("../auth/api", () => ({ authFetch: async (path: string) => path }));
vi.mock("../api/invalidate", () => ({ useVersion: () => net.version }));
vi.mock("../api/load", () => ({
  loadResource: async (fetcher: () => Promise<string>) => {
    const path = await fetcher();
    return new Promise((answer) => net.asked.push({ path, answer }));
  },
}));

const cats = (names: string[]) => ({ status: "ready", data: names.map((name, i) => ({ id: `c${i}`, name, kind: "expense", color: "#000" })) });
const extras = { status: "ready", data: { plaidEnabled: true, needsCategory: [], missingStandardCategories: [], limitedHistory: [] } };

describe("useActivityPanels", () => {
  it("a category added in Settings (a transactions bump) reaches Activity's pickers in place, never a skeleton", async () => {
    net.asked.length = 0;
    net.version = 0;
    const seen: ReturnType<typeof useActivityPanels>[] = [];
    function Probe() {
      seen.push(useActivityPanels());
      return null;
    }
    const r = render(<Probe />);
    const answer = async (path: string, s: unknown) => {
      await act(async () => {});
      const i = net.asked.findIndex((a) => a.path === path);
      expect(i).toBeGreaterThanOrEqual(0);
      const [req] = net.asked.splice(i, 1);
      await act(async () => req!.answer(s));
    };
    await answer("/api/mobile/categories", cats(["Groceries"]));
    await answer("/api/mobile/activity", extras);
    expect(seen.at(-1)!.categories.state).toMatchObject({ status: "ready", data: [{ name: "Groceries" }] });

    net.version = 1; // Settings → Categories → Add "Coffee" invalidates transactions
    const bump = seen.length;
    act(() => r.update(<Probe />));
    expect(seen.at(-1)!.categories.state.status).toBe("ready"); // still on screen while it re-reads
    await answer("/api/mobile/categories", cats(["Groceries", "Coffee"]));
    await answer("/api/mobile/activity", extras);
    expect(seen.slice(bump).every((s) => s.categories.state.status === "ready" && s.extras.state.status === "ready")).toBe(true);
    expect(seen.at(-1)!.categories.state).toMatchObject({ status: "ready", data: [{ name: "Groceries" }, { name: "Coffee" }] });
  });
});
