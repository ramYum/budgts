import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compareMigrationHistory, type LedgerRow, type LocalMigrationFile } from "../../tools/db/migration-history";

// Deterministic, realistically-shaped (64-char sha256 hex) fake hashes —
// mirrors what drizzle-kit actually stores, without needing real files.
const h = (label: string) => createHash("sha256").update(label).digest("hex");

const files = (...names: string[]): LocalMigrationFile[] => names.map((filename) => ({ filename, hash: h(filename) }));

const row = (id: number, filename: string, createdAt: number = id): LedgerRow => ({ id, hash: h(filename), createdAt });

describe("compareMigrationHistory", () => {
  it("1. exact repository/database match -> clean, no drift findings", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c.sql");
    const ledger = [row(1, "0000_a.sql"), row(2, "0001_b.sql"), row(3, "0002_c.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(true);
    expect(result.fresh).toBe(false);
    expect(result.appliedCount).toBe(3);
    expect(result.findings).toEqual([]);
  });

  it("2. missing migration (gap before a later recorded one) -> drift", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c.sql");
    // 0001 never recorded, but 0002 was -> proves a gap, not just "behind"
    const ledger = [row(1, "0000_a.sql"), row(2, "0002_c.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(false);
    const missing = result.findings.filter((f) => f.type === "missing");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ type: "missing", filename: "0001_b.sql" });
  });

  it("3. unexpected migration (ledger hash matches no repository file) -> drift", () => {
    const local = files("0000_a.sql", "0001_b.sql");
    const ledger = [row(1, "0000_a.sql"), row(2, "0001_b.sql"), { id: 3, hash: h("some-deleted-file.sql"), createdAt: 3 }];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(false);
    const unexpected = result.findings.filter((f) => f.type === "unexpected");
    expect(unexpected).toHaveLength(1);
    expect(unexpected[0]).toMatchObject({ type: "unexpected", ledgerId: 3 });
  });

  it("4. hash mismatch (file content changed after being applied) -> drift, reported specifically", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c.sql");
    // id=2 recorded some OTHER hash for what is now "0001_b.sql"'s position —
    // and 0002 IS recorded, so this isn't just "unapplied," it's a real gap
    // paired 1:1 with one unexpected row -> classified as hash_mismatch.
    const ledger = [row(1, "0000_a.sql"), { id: 2, hash: h("0001_b.sql -- edited after applying"), createdAt: 2 }, row(3, "0002_c.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(false);
    const mismatches = result.findings.filter((f) => f.type === "hash_mismatch");
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ type: "hash_mismatch", filename: "0001_b.sql", ledgerId: 2 });
    // must not ALSO double-report this as separate missing+unexpected
    expect(result.findings.filter((f) => f.type === "missing")).toHaveLength(0);
    expect(result.findings.filter((f) => f.type === "unexpected")).toHaveLength(0);
  });

  it("5. ordering anomaly (later ledger id maps to an earlier file than a prior id) -> drift", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c.sql");
    // id=2 (inserted after id=1) points at file index 2, then id=3 points
    // back at file index 1 -- goes backwards.
    const ledger = [row(1, "0000_a.sql"), row(2, "0002_c.sql"), row(3, "0001_b.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(false);
    const anomalies = result.findings.filter((f) => f.type === "ordering_anomaly");
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
  });

  it("6. malformed ledger row data -> drift, reported distinctly", () => {
    const local = files("0000_a.sql", "0001_b.sql");
    const ledger: LedgerRow[] = [
      row(1, "0000_a.sql"),
      { id: 2, hash: "31d0301832fcd039fbd4bab8fe0ea277", createdAt: 2 }, // 32-char, not sha256-shaped
    ];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(false);
    const malformed = result.findings.filter((f) => f.type === "malformed_ledger_row");
    expect(malformed).toHaveLength(1);
  });

  it("7. genuinely fresh database (ledger table does not exist) -> reported as fresh, not an error", () => {
    const local = files("0000_a.sql", "0001_b.sql");

    const result = compareMigrationHistory(local, null);

    expect(result.fresh).toBe(true);
    expect(result.clean).toBe(true);
    expect(result.findings).toEqual([{ type: "fresh" }]);
  });

  it("7b. genuinely fresh database (ledger table exists but empty) -> also reported as fresh", () => {
    const local = files("0000_a.sql", "0001_b.sql");

    const result = compareMigrationHistory(local, []);

    expect(result.fresh).toBe(true);
    expect(result.clean).toBe(true);
  });

  it("8. repository has a new migration beyond what's applied -> detected as pending, not a failure", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c_newly_added.sql");
    const ledger = [row(1, "0000_a.sql"), row(2, "0001_b.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(true); // pending tail is normal, not drift
    const pending = result.findings.filter((f) => f.type === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: "pending", filename: "0002_c_newly_added.sql" });
  });

  it("valid partial prefix (subset of a clean sequential deploy) is clean with a pending tail", () => {
    const local = files("0000_a.sql", "0001_b.sql", "0002_c.sql", "0003_d.sql");
    const ledger = [row(1, "0000_a.sql"), row(2, "0001_b.sql")];

    const result = compareMigrationHistory(local, ledger);

    expect(result.clean).toBe(true);
    expect(result.findings.filter((f) => f.type === "pending")).toHaveLength(2);
  });
});
