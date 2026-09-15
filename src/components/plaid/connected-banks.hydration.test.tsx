import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrate } from "@/test-utils/hydration";
import { ConnectedBanks, type ConnectedBank } from "./connected-banks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  disconnectBank: vi.fn(),
  syncConnection: vi.fn(),
  mapAccounts: vi.fn(),
  clearAccountReview: vi.fn(),
  setAccountCalculationExclusionAction: vi.fn(),
}));

vi.mock("./reconnect-button", () => ({
  ReconnectButton: () => <button type="button">Reconnect</button>,
}));

const NOW = Date.parse("2026-09-15T12:00:00.000Z");

const originalTz = process.env.TZ;
const setTz = (tz: string) => {
  process.env.TZ = tz;
};
const setNow = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(ms);

afterEach(() => {
  vi.restoreAllMocks();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function bank(lastSyncedAt: string): ConnectedBank {
  return {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    itemId: "item-sandbox-1",
    institutionName: "First Platypus Bank",
    status: "active",
    lastSyncedAt,
    accounts: [],
    unmappedAccounts: [],
  };
}

describe("ConnectedBanks 'Last synced' hydration", () => {
  it("hydrates without a mismatch when the clock crosses a relative-time boundary between render and hydration", async () => {
    // 59.4 min before the server render ("59 min ago"); a minute later in the browser it is "1 hr ago".
    const syncedAt = new Date(NOW - 59.4 * 60_000).toISOString();

    const { errors, text } = await hydrate(<ConnectedBanks banks={[bank(syncedAt)]} budgtsAccounts={[]} />, {
      serverEnv: () => {
        setTz("UTC");
        setNow(NOW);
      },
      clientEnv: () => setNow(NOW + 60_000),
    });

    expect(errors).toEqual([]);
    expect(text).toContain("Last synced 1 hr ago");
  });

  it("uses a sync timestamp whose calendar date really differs between UTC and New York", () => {
    const day = () => new Date("2026-09-10T02:00:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    setTz("UTC");
    const utc = day();
    setTz("America/New_York");
    expect(day()).not.toBe(utc);
  });

  it("hydrates without a mismatch when an older sync's calendar date differs between UTC and New York", async () => {
    const { errors, text } = await hydrate(
      <ConnectedBanks banks={[bank("2026-09-10T02:00:00.000Z")]} budgtsAccounts={[]} />,
      {
        serverEnv: () => {
          setTz("UTC");
          setNow(NOW);
        },
        clientEnv: () => setTz("America/New_York"),
      },
    );

    expect(errors).toEqual([]);
    // Once hydrated, the viewer sees the date in their own time zone.
    expect(text).toContain("Last synced Sep 9");
  });
});
