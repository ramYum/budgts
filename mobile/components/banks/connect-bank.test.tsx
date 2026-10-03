/**
 * Connect a bank and the bank-sync gate: a 402 from the link token or the exchange says "Bank sync needs a Budgts
 * subscription.", hands on to the paywall seam (`onSubscriptionRequired`, Phase 4), and leaves the button usable.
 */
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, render, texts } from "../../test/render";

vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
const api = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../../lib/auth/api", () => ({ authFetch: api.authFetch, NotAuthenticatedError: class NotAuthenticatedError extends Error {} }));
vi.mock("react-native-plaid-link-sdk", () => ({ sdkVersion: "13.0.0", createPlaidLinkSession: vi.fn() }));

import type { PlaidLinkClient } from "../../lib/plaid/plaid-link";
import { ConnectBank } from "./connect-bank";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const refusal = () => json(402, { error: "premium_required", entitlement: { hasPremium: false, status: "expired" } });
const success = (): PlaidLinkClient => ({ isAvailable: () => true, open: vi.fn(async () => ({ kind: "success" as const, publicToken: "public-1", institution: null })) });
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};
const MESSAGE = "Bank sync needs a Budgts subscription.";

describe("ConnectBank and the bank-sync gate", () => {
  beforeEach(() => api.authFetch.mockReset());

  it("a 402 from the link token: the message, the paywall seam, no Link, and the button works again", async () => {
    api.authFetch.mockResolvedValue(refusal());
    const link = success();
    const onSubscriptionRequired = vi.fn();
    const r = render(<ConnectBank link={link} onSubscriptionRequired={onSubscriptionRequired} />);
    await press(r, "connect-bank");
    expect(texts(byTestId(r, "connect-bank-error"))).toEqual([MESSAGE]);
    expect(onSubscriptionRequired).toHaveBeenCalledOnce();
    expect(link.open).not.toHaveBeenCalled();
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
    expect(byTestId(r, "connect-bank").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("a 402 from the exchange says the same, never the generic failure", async () => {
    api.authFetch.mockImplementation(async (path: string) => (path === "/api/plaid/link-token" ? json(200, { link_token: "link-1" }) : refusal()));
    const onSubscriptionRequired = vi.fn();
    const r = render(<ConnectBank link={success()} onSubscriptionRequired={onSubscriptionRequired} />);
    await press(r, "connect-bank");
    expect(texts(byTestId(r, "connect-bank-error"))).toEqual([MESSAGE]);
    expect(onSubscriptionRequired).toHaveBeenCalledOnce();
  });

  it("without the seam wired, the message alone is the answer (no crash)", async () => {
    api.authFetch.mockResolvedValue(refusal());
    const r = render(<ConnectBank link={success()} />);
    await press(r, "connect-bank");
    expect(texts(byTestId(r, "connect-bank-error"))).toEqual([MESSAGE]);
  });
});
