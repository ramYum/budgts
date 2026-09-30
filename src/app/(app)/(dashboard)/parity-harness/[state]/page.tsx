import { notFound } from "next/navigation";
import Loading from "../../loading";

/**
 * Dev-only parity harness (tools/parity, phase3-plan.md Task P2): puts the screens a real load only shows for a moment,
 * or only on failure, in front of the capture, inside the real signed-in shell:
 *   /parity-harness/loading   — the dashboard's loading skeleton, as the Suspense fallback shows it;
 *   /parity-harness/error     — a failed page load, caught by the real root error boundary (src/app/error.tsx);
 *   /parity-harness/not-found — the in-app not-found view.
 * Every path answers with the ordinary not-found page unless PARITY_HARNESS=1 is set on the server, which only the local
 * parity server (tools/parity/serve.ts) does; it is never set on Vercel.
 */
export default async function ParityHarness({ params }: PageProps<"/parity-harness/[state]">) {
  if (process.env.PARITY_HARNESS !== "1") notFound();
  const { state } = await params;
  if (state === "loading") return <Loading />;
  if (state === "error") throw new Error("parity harness: simulated load failure");
  notFound();
}
