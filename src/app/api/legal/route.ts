/**
 * GET /api/legal — whether the public Privacy, Terms, Support and Delete-your-account pages are live, and their paths.
 *
 * The apps link to those pages only while this says `live: true`, so the web's legal switch (src/lib/legal/config.ts:
 * every owner fact set) is the ONE switch for budgts.com and the apps: filling in the facts turns every link on, with no
 * app release. Public (src/proxy.ts), unauthenticated and free of personal data: a boolean and four paths.
 */
import { NextResponse } from "next/server";
import { LEGAL_PAGES, legalPagesLive } from "@/lib/legal/config";

export function GET() {
  const live = legalPagesLive();
  return NextResponse.json(
    { live, pages: live ? LEGAL_PAGES.map((p) => p.path) : [] },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
