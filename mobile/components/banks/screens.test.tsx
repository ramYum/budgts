import type { ReactNode } from "react";
import { View } from "react-native";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render, texts } from "../../test/render";
import type { StaleNoticeProps } from "../feedback/refresh-notice";

/**
 * The Connected banks and Accounts routes with their data layer faked at authFetch: a change to the user's accounts
 * (`invalidate("accounts")`, a realtime event) reloads in place and silently (never the pull spinner); a silent reload
 * that fails keeps the rows and says they may be out of date, with Refresh. Only the user's pull spins.
 */
const api = vi.hoisted(() => ({ handler: (_path: string): Promise<Response> => Promise.reject(new Error("unset")), spins: [] as boolean[] }));
vi.mock("../../lib/auth/api", () => ({ authFetch: (path: string) => api.handler(path), NotAuthenticatedError: class extends Error {} }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null, signOut: async () => {} }) }));
vi.mock("react-native-plaid-link-sdk", () => ({ sdkVersion: "13.0.0", createPlaidLinkSession: vi.fn() }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ navigate: () => {}, push: () => {}, back: () => {}, canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
// the shell's scroll view, reduced to its pull handler and spinner state; the stale-data notice is the shell's own
vi.mock("../shell/screen", async () => {
  const { StaleNotice } = await import("../feedback/refresh-notice");
  return {
    Screen: ({ children, onRefresh, refreshing, ...stale }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean } & StaleNoticeProps) => {
      // every render's spinner state, so a spinner shown for a moment can't hide between assertions
      api.spins.push(!!refreshing);
      return (
        <View testID="screen" {...({ onRefresh, refreshing } as object)}>
          <StaleNotice {...stale} />
          {children}
        </View>
      );
    },
  };
});

const { invalidate } = await import("../../lib/api/invalidate");
const { default: ConnectedBanksScreen } = await import("../../app/(app)/(tabs)/(more)/connected-banks");
const { default: AccountsScreen } = await import("../../app/(app)/(tabs)/(more)/accounts");

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const offline = () => Promise.reject(new TypeError("Network request failed"));

const accounts = {
  version: 1,
  accountTypes: ["checking", "credit", "cash", "savings"],
  accounts: [{ id: "a1", name: "Everyday checking", type: "checking", source: "manual", archived: false, selectable: true }],
};
const banks = {
  version: 1,
  enabled: true,
  budgtsAccounts: [],
  banks: [
    {
      id: "item-row",
      itemId: "plaid-item",
      institutionName: "First Platypus Bank",
      status: "active",
      lastSyncedAt: null,
      accounts: [
        {
          rowId: "row-1",
          plaidAccountId: "pa1",
          name: "Plaid Checking",
          officialName: null,
          mask: "0000",
          type: "depository",
          subtype: "checking",
          linkState: "mapped",
          mappedAccountName: "Everyday checking",
          needsReview: false,
          reviewReason: null,
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
      unmappedAccounts: [],
    },
  ],
};
const overview = {
  version: 1,
  month: "2026-09",
  groups: [{ key: "by-hand", title: "Added by hand", accounts: [{ id: "a1", name: "Everyday checking", type: "checking", is_archived: false, mask: null, txnCount: 3 }] }],
  archived: [],
};

const hostsById = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id);
const serve = (routes: Record<string, unknown>, fail = false) => {
  const calls: string[] = [];
  api.handler = (path) => {
    calls.push(path);
    return fail ? offline() : json(routes[path]);
  };
  return calls;
};

describe.each([
  ["Connected banks", ConnectedBanksScreen, { "/api/mobile/plaid/banks": banks, "/api/mobile/accounts": accounts }, "bank-item-row", "connected-banks"],
  ["Accounts", AccountsScreen, { "/api/mobile/accounts/overview": overview, "/api/mobile/accounts": accounts }, "account-row-a1", "accounts"],
] as const)("%s reloads", (_name, ScreenUnderTest, routes, rowId, screen) => {
  it("in place and silently on an accounts change, never with the pull spinner", async () => {
    serve(routes);
    const r = render(<ScreenUnderTest />);
    await act(async () => {});
    expect(hostsById(r, rowId)).toHaveLength(1);

    const calls = serve(routes);
    api.spins.length = 0;
    await act(async () => invalidate("accounts"));
    expect(calls.length).toBeGreaterThan(0);
    expect(api.spins).not.toContain(true);
    expect(hostsById(r, "screen")[0]!.props.refreshing).toBe(false);
    expect(hostsById(r, rowId)).toHaveLength(1);
  });

  it("keeps the rows when a silent reload fails, says so, and Refresh clears it", async () => {
    serve(routes);
    const r = render(<ScreenUnderTest />);
    await act(async () => {});

    serve(routes, true);
    await act(async () => invalidate("accounts"));
    expect(hostsById(r, rowId)).toHaveLength(1);
    expect(texts(r).join(" ")).toContain("These numbers may be out of date.");
    expect(hostsById(r, `${screen}-refresh-notice`)).toHaveLength(1);

    serve(routes);
    await act(async () => hostsById(r, `${screen}-refresh-notice-retry`)[0]!.props.onPress());
    expect(texts(r).join(" ")).not.toContain("These numbers may be out of date.");
    expect(hostsById(r, rowId)).toHaveLength(1);
  });
});
