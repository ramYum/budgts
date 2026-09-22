/**
 * Pure comparison logic for the migration-history verifier
 * (tools/db/verify-migration-history.ts, `npm run db:verify-history`).
 *
 * Deliberately has no I/O (no filesystem, no DB connection) so it's fully
 * unit-testable with fixtures — see tests/unit/db-migration-history.test.ts.
 *
 * Ground rule this module exists to enforce: compare the migration LEDGER
 * against the repository FILES, and report only what the ledger itself
 * proves. Never infer that a migration ran because some schema object
 * happens to exist — that's a different question (schema drift) this tool
 * does not answer. See docs/operations/database-migrations.md.
 */

const SHA256_HEX = /^[0-9a-f]{64}$/i;

export interface LocalMigrationFile {
  /** File name, e.g. "0017_superb_iron_monger.sql". Sort order = apply order. */
  filename: string;
  /** sha256 hex digest of the raw file content — same convention drizzle-kit uses. */
  hash: string;
}

export interface LedgerRow {
  id: unknown;
  hash: unknown;
  createdAt: unknown;
}

export type Finding =
  | { type: "fresh" }
  | { type: "malformed_ledger_row"; row: LedgerRow; reason: string }
  | { type: "missing"; filename: string; index: number }
  | { type: "unexpected"; ledgerId: unknown; hashPrefix: string }
  | { type: "hash_mismatch"; filename: string; index: number; ledgerId: unknown; expectedHashPrefix: string; actualHashPrefix: string }
  | { type: "ordering_anomaly"; ledgerId: unknown; detail: string }
  | { type: "pending"; filename: string; index: number };

export interface ComparisonResult {
  /** true only when there is zero drift — malformed rows, missing, unexpected,
   * mismatched, or ordering findings. "pending" (not-yet-applied tail) does
   * NOT count against cleanliness — that's the normal pre-deploy state. */
  clean: boolean;
  fresh: boolean;
  appliedCount: number;
  totalFileCount: number;
  findings: Finding[];
}

function isWellFormedRow(row: LedgerRow): row is { id: number; hash: string; createdAt: number } {
  return (
    typeof row.id === "number" &&
    Number.isInteger(row.id) &&
    row.id > 0 &&
    typeof row.hash === "string" &&
    SHA256_HEX.test(row.hash) &&
    (typeof row.createdAt === "number" || typeof row.createdAt === "string" || row.createdAt instanceof Date)
  );
}

function malformedReason(row: LedgerRow): string {
  const reasons: string[] = [];
  if (typeof row.id !== "number" || !Number.isInteger(row.id) || row.id <= 0) {
    reasons.push(`id is not a positive integer (got ${JSON.stringify(row.id)})`);
  }
  if (typeof row.hash !== "string" || !SHA256_HEX.test(row.hash)) {
    reasons.push(
      typeof row.hash === "string"
        ? `hash is not a 64-char sha256 hex digest (got ${row.hash.length} chars: "${row.hash.slice(0, 12)}...")`
        : `hash is missing or not a string (got ${JSON.stringify(row.hash)})`,
    );
  }
  if (row.createdAt == null) reasons.push("createdAt is missing");
  return reasons.join("; ") || "unspecified malformed row";
}

/**
 * Compares repository migration files against the raw ledger rows read from
 * `drizzle.__drizzle_migrations`. Pass `ledgerRows: null` when the ledger
 * table does not exist at all (a genuinely fresh database) — distinct from
 * `[]`, which means the table exists but has zero rows (also fresh, reported
 * the same way).
 */
export function compareMigrationHistory(localFiles: LocalMigrationFile[], ledgerRows: LedgerRow[] | null): ComparisonResult {
  const files = [...localFiles].sort((a, b) => a.filename.localeCompare(b.filename));
  const findings: Finding[] = [];

  if (ledgerRows === null || ledgerRows.length === 0) {
    return { clean: true, fresh: true, appliedCount: 0, totalFileCount: files.length, findings: [{ type: "fresh" }] };
  }

  const wellFormed: { id: number; hash: string; createdAt: unknown }[] = [];
  for (const row of ledgerRows) {
    if (isWellFormedRow(row)) {
      wellFormed.push(row);
    } else {
      findings.push({ type: "malformed_ledger_row", row, reason: malformedReason(row) });
    }
  }
  wellFormed.sort((a, b) => a.id - b.id);

  const hashToIndex = new Map(files.map((f, i) => [f.hash, i]));

  const matched: { ledgerId: number; hash: string; index: number }[] = [];
  const unexpectedRows: { ledgerId: number; hash: string }[] = [];
  for (const row of wellFormed) {
    const index = hashToIndex.get(row.hash);
    if (index === undefined) {
      unexpectedRows.push({ ledgerId: row.id, hash: row.hash });
    } else {
      matched.push({ ledgerId: row.id, hash: row.hash, index });
    }
  }

  // Ordering: as ledger id increases, matched file index must strictly increase.
  for (let i = 1; i < matched.length; i++) {
    if (matched[i].index <= matched[i - 1].index) {
      findings.push({
        type: "ordering_anomaly",
        ledgerId: matched[i].ledgerId,
        detail:
          `ledger id ${matched[i].ledgerId} maps to file index ${matched[i].index} ` +
          `(${files[matched[i].index]?.filename}), which is not after id ${matched[i - 1].ledgerId}'s ` +
          `file index ${matched[i - 1].index} (${files[matched[i - 1].index]?.filename})`,
      });
    }
  }

  const matchedIndices = new Set(matched.map((m) => m.index));
  const maxMatchedIndex = matched.length > 0 ? Math.max(...matched.map((m) => m.index)) : -1;

  const gapIndices: number[] = [];
  const pendingIndices: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (matchedIndices.has(i)) continue;
    if (i < maxMatchedIndex) gapIndices.push(i);
    else pendingIndices.push(i);
  }

  // Pair up same-rank gaps with unexpected rows as "hash_mismatch" (the file
  // was very likely edited after being applied) when the counts line up;
  // otherwise report each generically — we can't confidently pair them.
  if (gapIndices.length === unexpectedRows.length && gapIndices.length > 0) {
    for (let i = 0; i < gapIndices.length; i++) {
      const index = gapIndices[i];
      const row = unexpectedRows[i];
      findings.push({
        type: "hash_mismatch",
        filename: files[index].filename,
        index,
        ledgerId: row.ledgerId,
        expectedHashPrefix: files[index].hash.slice(0, 12),
        actualHashPrefix: row.hash.slice(0, 12),
      });
    }
  } else {
    for (const index of gapIndices) {
      findings.push({ type: "missing", filename: files[index].filename, index });
    }
    for (const row of unexpectedRows) {
      findings.push({ type: "unexpected", ledgerId: row.ledgerId, hashPrefix: row.hash.slice(0, 12) });
    }
  }

  for (const index of pendingIndices) {
    findings.push({ type: "pending", filename: files[index].filename, index });
  }

  const clean = findings.every((f) => f.type === "pending" || f.type === "fresh");

  return {
    clean,
    fresh: false,
    appliedCount: matched.length,
    totalFileCount: files.length,
    findings,
  };
}

/** Renders a ComparisonResult as a concise, human-actionable report string. */
export function formatReport(result: ComparisonResult): string {
  const lines: string[] = [];

  if (result.fresh) {
    lines.push("Database is FRESH — no application migrations recorded in the ledger.");
    lines.push(`Repository has ${result.totalFileCount} migration file(s) ready to apply.`);
    return lines.join("\n");
  }

  lines.push(
    `Ledger has ${result.appliedCount} matched migration(s) out of ${result.totalFileCount} repository file(s).`,
  );

  const byType = <T extends Finding["type"]>(t: T) => result.findings.filter((f) => f.type === t);

  const missing = byType("missing");
  const unexpected = byType("unexpected");
  const mismatched = byType("hash_mismatch");
  const ordering = byType("ordering_anomaly");
  const malformed = byType("malformed_ledger_row");
  const pending = byType("pending");

  if (mismatched.length) {
    lines.push(`\n🔴 HASH MISMATCH (${mismatched.length}) — file content differs from what the ledger recorded as applied:`);
    for (const f of mismatched) {
      if (f.type !== "hash_mismatch") continue;
      lines.push(`  - ${f.filename} (ledger id ${String(f.ledgerId)}): expected ${f.expectedHashPrefix}…, ledger has ${f.actualHashPrefix}…`);
    }
  }
  if (missing.length) {
    lines.push(`\n🔴 MISSING (${missing.length}) — repository files with no matching ledger entry, despite a later migration being recorded:`);
    for (const f of missing) if (f.type === "missing") lines.push(`  - ${f.filename}`);
  }
  if (unexpected.length) {
    lines.push(`\n🔴 UNEXPECTED (${unexpected.length}) — ledger entries matching no repository file:`);
    for (const f of unexpected) if (f.type === "unexpected") lines.push(`  - ledger id ${String(f.ledgerId)}, hash ${f.hashPrefix}…`);
  }
  if (ordering.length) {
    lines.push(`\n🔴 ORDERING ANOMALY (${ordering.length}):`);
    for (const f of ordering) if (f.type === "ordering_anomaly") lines.push(`  - ${f.detail}`);
  }
  if (malformed.length) {
    lines.push(`\n🔴 MALFORMED LEDGER ROW (${malformed.length}):`);
    for (const f of malformed) if (f.type === "malformed_ledger_row") lines.push(`  - ${f.reason}`);
  }
  if (pending.length) {
    lines.push(`\n⏳ Pending (not yet applied, not drift) (${pending.length}):`);
    for (const f of pending) if (f.type === "pending") lines.push(`  - ${f.filename}`);
  }

  lines.push(result.clean ? "\n✅ CLEAN — ledger matches repository history (with only a normal pending tail, if any)." : "\n❌ DRIFT DETECTED.");

  return lines.join("\n");
}
