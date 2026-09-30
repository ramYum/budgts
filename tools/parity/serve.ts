/**
 * Builds and serves the web app for parity work on port 3200 (3000 and 8081 belong to device runs, 3100 to Wave 0),
 * wired to STAGING through `.env.staging` only, with the dev-only parity harness and the Sandbox seed route switched on
 * for this local process. A production build (`next build` + `next start`), never `next dev`: the captures must show what
 * users get, and a cold dev compile would time out the first navigation.
 *
 *   npx tsx tools/parity/serve.ts [--root <worktree>] [--port 3200] [--no-build]
 *
 * `--build-only` stops after the build. `--root` serves another checkout (the reference build of the approved PWA) with this worktree's staging env.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadStagingEnv } from "./env";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = resolve(flag("--root") ?? process.cwd());
const port = flag("--port") ?? "3200";
if (["3000", "3100", "8081"].includes(port)) throw new Error(`parity: port ${port} belongs to another run`);

loadStagingEnv(process.cwd());
const env = {
  ...process.env,
  PARITY_HARNESS: "1",
  PLAID_TEST_SEED_ENABLED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(cmd: string, cmdArgs: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}`))));
  });
}

async function main() {
  if (!args.includes("--no-build")) await run("npx", ["next", "build"]);
  if (args.includes("--build-only")) return;
  console.log(`parity web → http://localhost:${port} (${root}, staging)`);
  await run("npx", ["next", "start", "-p", port]);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
