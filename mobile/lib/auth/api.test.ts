import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { authFetch, NotAuthenticatedError } from "./api";

const fakeSession = { access_token: "test-token" } as Session;

describe("authFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("throws NotAuthenticatedError when there is no session", async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.example.com");
    await expect(authFetch("/api/mobile/session", null)).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    );
  });

  it("attaches the session access token as a Bearer header", async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await authFetch("/api/mobile/session", fakeSession);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/mobile/session",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});
