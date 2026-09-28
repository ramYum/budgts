import { NotAuthenticatedError } from "../auth/api";
import { parseMobileHome, type MobileHome } from "./contract";

export type HomeErrorKind = "auth" | "unavailable" | "network" | "contract";

export type HomeState =
  | { status: "loading" }
  | { status: "ready"; home: MobileHome }
  | { status: "error"; kind: HomeErrorKind; message: string };

const MESSAGES: Record<HomeErrorKind, string> = {
  auth: "Your session has expired. Please sign in again.",
  unavailable: "Budgts couldn't load your numbers right now. Please try again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  contract: "Budgts sent something this version of the app doesn't understand. Please update the app.",
};

type Settled = Exclude<HomeState, { status: "loading" }>;

const error = (kind: HomeErrorKind): Settled => ({ status: "error", kind, message: MESSAGES[kind] });

/**
 * Runs the Home request and maps every outcome to a state the screen can render
 * — success, or a specific retryable/actionable error. Never throws, never
 * surfaces the raw error text (it can carry hostnames), and never returns
 * numbers unless the body passed the contract check.
 */
export async function loadHome(
  fetcher: () => Promise<Response>,
): Promise<Exclude<HomeState, { status: "loading" }>> {
  let response: Response;
  try {
    response = await fetcher();
  } catch (err) {
    return err instanceof NotAuthenticatedError ? error("auth") : error("network");
  }

  if (response.status === 401) return error("auth");
  if (!response.ok) return error("unavailable");

  try {
    return { status: "ready", home: parseMobileHome(await response.json()) };
  } catch {
    // Unreadable JSON or a body that fails the contract check: same outcome.
    return error("contract");
  }
}
