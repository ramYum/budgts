// @vitest-environment node
/**
 * `npm run billing:grant` (tools/billing/grant-tool.ts) against REAL Postgres with the repo's migration chain
 * (embedded PGlite): the target confirmation, the dry run writing nothing, apply, and idempotency.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONFIRM_ENV, parseGrantArgs, runGrantTool, type GrantToolIo } from "../../tools/billing/grant-tool";
import { asBillingDb, createAuthUser, newMigratedDb } from "./helpers/pglite-db";

const STAGING = "uvowywszaiojboaxdmoz";
const PROD = "wsmhstqpvbbcqpqhiqyp";
const url = (ref: string) => `postgresql://postgres.${ref}:secretpw@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;
const NOW = new Date("2026-10-02T12:00:00Z");

let pg: PGlite;
beforeAll(async () => {
  pg = await newMigratedDb();
}, 120_000);
afterAll(async () => {
  await pg.close();
});

function io(env: Record<string, string | undefined>): GrantToolIo & { lines: string[]; opened: number } {
  const lines: string[] = [];
  const out = {
    lines,
    opened: 0,
    env,
    log: (l: string) => void lines.push(l),
    openDb: async () => {
      out.opened++;
      return { db: asBillingDb(pg), close: async () => {} };
    },
    now: () => NOW,
    operator: () => "operator",
  };
  return out;
}
const stagingEnv = () => ({ DIRECT_URL: url(STAGING), [CONFIRM_ENV]: STAGING });
const entitlement = async (u: string) =>
  (await pg.query<{ state: string; provider: string | null; access_until: Date | null }>(`select state, provider, access_until from entitlements where user_id = $1`, [u])).rows[0] ?? null;
const auditRows = async (u: string) =>
  (await pg.query<{ event_type: string; environment: string; payload: { reason: string; granted_by: string } }>(
    `select event_type, environment, payload from billing_events where user_id = $1 and provider = 'manual'`,
    [u],
  )).rows;

describe("parseGrantArgs", () => {
  it("reads repeated --email, the reason and the switches", () => {
    expect(parseGrantArgs(["--ref", STAGING, "--email", "a@x.test", "--email", "b@x.test", "--reason", "owner", "--apply"])).toEqual({
      ref: STAGING,
      emails: ["a@x.test", "b@x.test"],
      reason: "owner",
      apply: true,
      revoke: false,
      envFile: ".env.local",
      by: null,
    });
  });

  it.each([
    [["--email", "a@x.test", "--reason", "r"], "--ref"],
    [["--ref", STAGING, "--reason", "r"], "--email"],
    [["--ref", STAGING, "--email", "a@x.test"], "--reason"],
    [["--ref", STAGING, "--email", "not-an-email", "--reason", "r"], "not an email"],
    [["--ref", STAGING, "--email", "a@x.test", "--email", "A@x.test", "--reason", "r"], "twice"],
    [["--ref", STAGING, "--email", "a@x.test", "--reason", "r", "--yes"], "unknown argument"],
    [["--ref", "--email", "a@x.test"], "needs a value"],
  ])("refuses %j (%s)", (argv, words) => {
    const r = parseGrantArgs(argv);
    expect("error" in r && r.error).toContain(words);
  });
});

describe("runGrantTool: target confirmation (as predb:migrate)", () => {
  const argv = ["--ref", STAGING, "--email", "a@x.test", "--reason", "r", "--apply"];
  it.each([
    ["no confirmation variable", { DIRECT_URL: url(STAGING) }],
    ["a confirmation for another project", { DIRECT_URL: url(STAGING), [CONFIRM_ENV]: PROD }],
    ["--ref naming another project than the database", { DIRECT_URL: url(PROD), [CONFIRM_ENV]: PROD }],
    ["no database URL", { [CONFIRM_ENV]: STAGING }],
    ["a retired staging project", { DIRECT_URL: url("iwypmifvmtmkwtnxkfma"), [CONFIRM_ENV]: "iwypmifvmtmkwtnxkfma" }],
  ])("refuses with %s and never opens the database", async (_, env: Record<string, string>) => {
    const t = io(env);
    const args = env.DIRECT_URL?.includes("iwypmifvmtmkwtnxkfma") ? ["--ref", "iwypmifvmtmkwtnxkfma", ...argv.slice(2)] : argv;
    expect(await runGrantTool(args, t)).toBe(1);
    expect(t.opened).toBe(0);
  });
});

describe("runGrantTool: dry run, apply, idempotency, revoke", () => {
  it("the dry run prints each email's account and the row it would write, and writes nothing", async () => {
    const u = await createAuthUser(pg);
    const t = io(stagingEnv());
    expect(await runGrantTool(["--ref", STAGING, "--email", `${u}@example.test`, "--reason", "owner account"], t)).toBe(0);
    const out = t.lines.join("\n");
    expect(out).toContain("DRY RUN");
    expect(out).toContain(`${u}@example.test -> user ${u} (no entitlement row)`);
    expect(out).toContain("would write: state=active provider=manual store=null product_id=null will_renew=false access_until=9999-12-31T00:00:00.000Z");
    expect(out).not.toContain("secretpw");
    expect(await entitlement(u)).toBeNull();
    expect(await auditRows(u)).toEqual([]);
  });

  it("--apply grants and audits; running it again changes nothing and says so", async () => {
    const a = await createAuthUser(pg);
    const b = await createAuthUser(pg);
    const argv = ["--ref", STAGING, "--email", `${a}@example.test`, "--email", `${b}@example.test`, "--reason", "owner account, launch spec 9", "--by", "owner", "--apply"];
    const first = io(stagingEnv());
    expect(await runGrantTool(argv, first)).toBe(0);
    expect(first.lines.join("\n")).toContain("done. granted=2");
    for (const u of [a, b]) {
      expect(await entitlement(u)).toEqual({ state: "active", provider: "manual", access_until: new Date("9999-12-31T00:00:00.000Z") });
      expect(await auditRows(u)).toEqual([{ event_type: "MANUAL_GRANT", environment: "sandbox", payload: expect.objectContaining({ reason: "owner account, launch spec 9", granted_by: "owner" }) }]);
    }

    const again = io(stagingEnv());
    expect(await runGrantTool(argv, again)).toBe(0);
    const out = again.lines.join("\n");
    expect(out).toContain("already granted: nothing to change");
    expect(out).toContain("done. already_granted=2");
    for (const u of [a, b]) expect(await auditRows(u)).toHaveLength(1);
  });

  it("an unknown email stops the whole run before anything is written", async () => {
    const u = await createAuthUser(pg);
    const t = io(stagingEnv());
    expect(await runGrantTool(["--ref", STAGING, "--email", `${u}@example.test`, "--email", "nobody@example.test", "--reason", "r", "--apply"], t)).toBe(1);
    expect(t.lines.join("\n")).toContain("nobody@example.test: NO account has this email");
    expect(await entitlement(u)).toBeNull();
  });

  it("--revoke --apply ends the grant and audits it; a second revoke changes nothing", async () => {
    const u = await createAuthUser(pg);
    const base = ["--ref", STAGING, "--email", `${u}@example.test`, "--reason", "test cleanup"];
    expect(await runGrantTool([...base, "--apply"], io(stagingEnv()))).toBe(0);
    expect(await runGrantTool([...base, "--revoke", "--apply"], io(stagingEnv()))).toBe(0);
    expect(await entitlement(u)).toEqual({ state: "expired", provider: null, access_until: NOW });
    const again = io(stagingEnv());
    expect(await runGrantTool([...base, "--revoke", "--apply"], again)).toBe(0);
    expect(again.lines.join("\n")).toContain("no manual grant: nothing changed");
    expect((await auditRows(u)).map((r) => r.event_type)).toEqual(["MANUAL_GRANT", "MANUAL_GRANT_REVOKED"]);
  });

  it("records production grants as production events", async () => {
    const u = await createAuthUser(pg);
    const t = io({ DIRECT_URL: url(PROD), [CONFIRM_ENV]: PROD });
    expect(await runGrantTool(["--ref", PROD, "--email", `${u}@example.test`, "--reason", "owner", "--apply"], t)).toBe(0);
    expect(t.lines.join("\n")).toContain("PRODUCTION");
    expect((await auditRows(u))[0].environment).toBe("production");
  });
});
