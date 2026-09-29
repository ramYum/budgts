import { beforeEach, describe, expect, it, vi } from "vitest";

const updateGoal = vi.fn();
const setGoalArchived = vi.fn();
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/revalidate", () => ({ revalidateUserData: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => ({ id: "user-a" }),
  createClient: async () => ({ __as: "user-a" }),
}));
vi.mock("@/lib/goals/commands", () => ({
  updateGoal: (...a: unknown[]) => updateGoal(...a),
  setGoalArchived: (...a: unknown[]) => setGoalArchived(...a),
  createGoal: vi.fn(),
  addContribution: vi.fn(),
  deleteContribution: vi.fn(),
}));

import { setGoalArchived as archiveAction, updateGoal as updateAction } from "./savings";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeEach(() => {
  updateGoal.mockReset();
  setGoalArchived.mockReset();
});

describe("goal actions while an account deletion holds the lock", () => {
  it("say changes are paused, not that the goal is gone", async () => {
    updateGoal.mockResolvedValue({ ok: false, error: "locked" });
    expect(await updateAction({}, form({ id: "g1", name: "Trip", targetAmount: "5", targetDate: "" }))).toEqual({
      error: "Your account is being deleted, so changes are paused.",
    });
    setGoalArchived.mockResolvedValue({ ok: false, error: "missing" });
    expect(await archiveAction({}, form({ id: "g1", archived: "1" }))).toEqual({
      error: "That goal no longer exists. Refresh and try again.",
    });
  });
});
