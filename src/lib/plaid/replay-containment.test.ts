import { describe, expect, it } from "vitest";
import { ADVANCIAL_INSTITUTION_ID, planReplayContainment } from "./replay-containment";

function cand(id: string, contentFingerprint: string, userCategorized = false) {
  return { id, contentFingerprint, userCategorized };
}

describe("planReplayContainment", () => {
  it("marks every row but one in a duplicated fingerprint group", () => {
    const updates = planReplayContainment([
      cand("a", "fp1"),
      cand("b", "fp1"),
      cand("c", "fp1"),
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0].duplicateIds).toHaveLength(2);
    expect(updates[0].duplicateIds).not.toContain(updates[0].canonicalId);
    expect(["a", "b", "c"]).toContain(updates[0].canonicalId);
  });

  it("leaves a singular fingerprint (no duplicates) alone", () => {
    const updates = planReplayContainment([cand("a", "fp1"), cand("b", "fp2")]);
    expect(updates).toHaveLength(0);
  });

  it("picks the user-categorized row as canonical when one exists in the group", () => {
    const updates = planReplayContainment([
      cand("a", "fp1"),
      cand("b", "fp1", true),
      cand("c", "fp1"),
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0].canonicalId).toBe("b");
    expect(updates[0].duplicateIds.sort()).toEqual(["a", "c"]);
  });

  it("is deterministic when no row is user-categorized (lowest id wins)", () => {
    const updates1 = planReplayContainment([cand("z", "fp1"), cand("a", "fp1"), cand("m", "fp1")]);
    const updates2 = planReplayContainment([cand("m", "fp1"), cand("z", "fp1"), cand("a", "fp1")]);
    expect(updates1[0].canonicalId).toBe("a");
    expect(updates2[0].canonicalId).toBe("a");
  });

  it("handles multiple independent duplicate groups in one call", () => {
    const updates = planReplayContainment([
      cand("a1", "fp1"),
      cand("a2", "fp1"),
      cand("b1", "fp2"),
      cand("b2", "fp2"),
      cand("b3", "fp2"),
      cand("solo", "fp3"),
    ]);
    expect(updates).toHaveLength(2);
    const byCanonical = new Map(updates.map((u) => [u.canonicalId, u]));
    expect(byCanonical.get("a1")?.duplicateIds).toEqual(["a2"]);
    expect(byCanonical.get("b1")?.duplicateIds.sort()).toEqual(["b2", "b3"]);
  });

  it("returns nothing for an empty candidate list", () => {
    expect(planReplayContainment([])).toEqual([]);
  });

  it("exposes Advancial's confirmed institution id as a named constant", () => {
    expect(ADVANCIAL_INSTITUTION_ID).toBe("ins_116484");
  });
});
