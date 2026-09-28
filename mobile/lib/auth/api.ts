import type { Session } from "@supabase/supabase-js";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
  }
}

/**
 * Calls a Budgts backend Route Handler with the current Supabase session's
 * access token as a Bearer credential — the mobile transport per
 * docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6. The server
 * verifies this token itself (`src/lib/auth/get-request-user.ts`); the user
 * id is never sent as a request parameter.
 */
export async function authFetch(
  path: string,
  session: Session | null,
  init: RequestInit = {},
): Promise<Response> {
  if (!session?.access_token) throw new NotAuthenticatedError();

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be set (see .env.example)");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
}
