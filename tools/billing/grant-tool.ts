/**
 * `npm run billing:grant` — the operator tool for the PERMANENT MANUAL GRANT (launch spec §9: "The owner's existing
 * accounts are grandfathered by a manual entitlement grant, recorded as such"). Logic only; the entry point is
 * tools/billing/grant.ts. How to run it: docs/operations/billing-manual-grant.md.
 *
 *   npm run billing:grant -- --ref <project-ref> --email <a> [--email <b> ...] --reason "<text>" [--apply] [--revoke]
 *                            [--env-file <path>] [--by <who>]
 *
 * Safety, in order:
 *  - DRY RUN BY DEFAULT: every email is resolved to its account and the row it would write is printed; nothing is
 *    written without --apply.
 *  - TARGET CONFIRMATION, as `predb:migrate` does (tools/db/target-safety.ts): the database URL's project ref must equal
 *    BOTH --ref and the BILLING_GRANT_CONFIRM_REF environment variable, so it cannot run against the wrong project by
 *    accident. Retired staging projects are refused outright.
 *  - ALL OR NOTHING ON INPUT: an unknown or ambiguous email, a deleting account, or a refusal (a live store
 *    subscription) stops the run before anything is written.
 *  - IDEMPOTENT: re-granting a granted user writes nothing and says so.
 */
import type { Db } from "../../src/lib/billing/db";
import { MANUAL_GRANT_ACCESS_UNTIL } from "../../src/lib/billing/entitlement";
import {
  applyManualGrant,
  inspectGrantTargets,
  planGrant,
  planRevoke,
  revokeManualGrant,
  type GrantAudit,
  type GrantTarget,
} from "../../src/lib/billing/manual-grant";
import { requireConfirmedRef } from "../db/target-safety";

export const CONFIRM_ENV = "BILLING_GRANT_CONFIRM_REF";

export interface GrantArgs {
  ref: string;
  emails: string[];
  reason: string;
  apply: boolean;
  revoke: boolean;
  envFile: string;
  by: string | null;
}

export function parseGrantArgs(argv: string[]): GrantArgs | { error: string } {
  const out: GrantArgs = { ref: "", emails: [], reason: "", apply: false, revoke: false, envFile: ".env.local", by: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    try {
      if (a === "--ref") out.ref = value().trim();
      else if (a === "--email") out.emails.push(value().trim());
      else if (a === "--reason") out.reason = value().trim();
      else if (a === "--env-file") out.envFile = value();
      else if (a === "--by") out.by = value().trim();
      else if (a === "--apply") out.apply = true;
      else if (a === "--revoke") out.revoke = true;
      else return { error: `unknown argument: ${a}` };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
  if (!out.ref) return { error: "--ref <project-ref> is required" };
  if (out.emails.length === 0) return { error: "at least one --email is required" };
  const bad = out.emails.find((e) => !/^[^\s@]+@[^\s@]+$/.test(e));
  if (bad !== undefined) return { error: `not an email address: ${JSON.stringify(bad)}` };
  if (new Set(out.emails.map((e) => e.toLowerCase())).size !== out.emails.length) return { error: "an email is listed twice" };
  if (!out.reason) return { error: '--reason "<text>" is required (it is recorded in the audit row)' };
  if (out.reason.length > 500) return { error: "--reason is longer than 500 characters" };
  return out;
}

export interface GrantToolIo {
  /** Process environment merged with the env file (process values win, as dotenv does). */
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  openDb: (url: string) => Promise<{ db: Db; close: () => Promise<void> }>;
  now: () => Date;
  /** Who is running this, when --by is not given. */
  operator: () => string;
}

const USAGE =
  'usage: npm run billing:grant -- --ref <project-ref> --email <a> [--email <b> ...] --reason "<text>" [--apply] [--revoke] [--env-file <path>] [--by <who>]';

const describeRow = (t: GrantTarget) =>
  t.current
    ? `state=${t.current.state} provider=${t.current.provider ?? "null"} access_until=${t.current.accessUntil?.toISOString() ?? "null"}`
    : "no entitlement row";

/** Runs the tool; returns the process exit code. */
export async function runGrantTool(argv: string[], io: GrantToolIo): Promise<number> {
  const args = parseGrantArgs(argv);
  if ("error" in args) {
    io.log(`billing:grant: ${args.error}\n${USAGE}`);
    return 2;
  }

  const url = io.env.DIRECT_URL ?? io.env.DATABASE_URL;
  if (!url) {
    io.log(`billing:grant: no DIRECT_URL / DATABASE_URL in the environment or ${args.envFile}.`);
    return 1;
  }
  let identity;
  try {
    identity = requireConfirmedRef(url, io.env[CONFIRM_ENV]);
  } catch (err) {
    io.log(`billing:grant: ${(err as Error).message}\nConfirm the target with: ${CONFIRM_ENV}=<the ref you intend> (see docs/operations/billing-manual-grant.md)`);
    return 1;
  }
  if (identity.ref !== args.ref) {
    io.log(`billing:grant: --ref "${args.ref}" does not match the database's project ref "${identity.ref}". Stopping.`);
    return 1;
  }
  if (identity.known?.danger === "staging-legacy") {
    io.log(`billing:grant: ${identity.ref} is a retired staging project (${identity.known.label}). Refusing.`);
    return 1;
  }

  const environment: GrantAudit["environment"] = identity.known?.danger === "production" ? "production" : "sandbox";
  const now = io.now();
  const audit: GrantAudit = { reason: args.reason, grantedBy: args.by || io.operator(), environment, now };
  const action = args.revoke ? "REVOKE" : "GRANT";

  io.log(`billing:grant: ${args.apply ? "APPLY" : "DRY RUN (nothing is written; add --apply to write)"} - ${action}`);
  io.log(`  target: ${identity.maskedUrl}`);
  io.log(`  project ref: ${identity.ref} (${identity.known ? identity.known.label : "not in the known-projects registry"})`);
  io.log(`  reason: ${audit.reason}`);
  io.log(`  recorded as: billing_events provider=manual, environment=${environment}, granted_by=${audit.grantedBy}`);

  const { db, close } = await io.openDb(url);
  try {
    const targets = await inspectGrantTargets(db, args.emails);

    // Plan everything first: any problem stops the run before a single write.
    let blocked = false;
    const work: { target: GrantTarget & { userId: string }; plan: string }[] = [];
    for (const t of targets) {
      if (!t.userId) {
        io.log(`  ${t.email}: ${t.ambiguous ? "MORE THAN ONE account has this email" : "NO account has this email"}`);
        blocked = true;
        continue;
      }
      io.log(`  ${t.email} -> user ${t.userId} (${describeRow(t)})`);
      if (t.deleting) {
        io.log(`    refused: account deletion has started`);
        blocked = true;
        continue;
      }
      if (args.revoke) {
        const p = planRevoke(t.current, now);
        if (p.kind === "not_granted") io.log(`    no manual grant: nothing to revoke`);
        else io.log(`    would write: state=expired provider=null will_renew=false access_until=${now.toISOString()} + a MANUAL_GRANT_REVOKED audit row`);
        work.push({ target: { ...t, userId: t.userId }, plan: p.kind });
        continue;
      }
      const p = planGrant(t.current, now);
      if (p.kind === "refused") {
        io.log(`    refused: ${p.reason}`);
        blocked = true;
      } else if (p.kind === "already_granted") {
        io.log(`    already granted: nothing to change`);
      } else {
        io.log(
          `    would write: state=active provider=manual store=null product_id=null will_renew=false access_until=${MANUAL_GRANT_ACCESS_UNTIL.toISOString()} + a MANUAL_GRANT audit row`,
        );
      }
      work.push({ target: { ...t, userId: t.userId }, plan: p.kind });
    }

    if (blocked) {
      io.log(`billing:grant: stopped; nothing was written. Fix the lines above and run again.`);
      return 1;
    }
    if (!args.apply) {
      io.log(`billing:grant: dry run complete. Re-run with --apply to write.`);
      return 0;
    }

    const counts: Record<string, number> = {};
    for (const { target } of work) {
      const r = args.revoke ? await revokeManualGrant(db, target.userId, audit) : await applyManualGrant(db, target.userId, audit);
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      const words: Record<string, string> = {
        granted: "granted",
        already_granted: "already granted: nothing changed",
        revoked: "revoked",
        not_granted: "no manual grant: nothing changed",
      };
      io.log(`  ${target.email}: ${"reason" in r ? `refused: ${r.reason}` : words[r.outcome]}`);
    }
    io.log(`billing:grant: done. ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    return counts.refused ? 1 : 0;
  } finally {
    await close();
  }
}
