/**
 * `prebuild` — npm runs this before `npm run build`. A Vercel production build
 * refuses to ship without the server secrets the app runs on
 * (src/lib/env/production-env.ts); every other build (CI, Preview, local)
 * needs none, because each secret is read on first use.
 *
 * It reads the real process environment, which is what Vercel injects, and
 * deliberately not the local `.env*` files that `next build` loads: a pulled
 * `.env.production` says VERCEL_ENV=production with its secrets masked, and
 * must not turn a local build into a refused production one.
 */
import { productionEnvProblems } from "../src/lib/env/production-env";

const target = process.env.VERCEL ? (process.env.VERCEL_ENV ?? "unknown") : null;

if (target === "production") {
  const problems = productionEnvProblems(process.env);
  if (problems.length > 0) {
    console.error(`Refusing to build for production:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("✓ Production env check passed");
} else if (target) {
  console.log(`Production env check skipped: ${target} build`);
}
