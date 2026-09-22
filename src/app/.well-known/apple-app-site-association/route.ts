/**
 * GET /.well-known/apple-app-site-association — the iOS universal-link association (no file extension, served as JSON).
 * 404 until `APPLE_APP_ID` (`<TEAMID>.<bundle id>`) is configured; see `src/lib/native-links.ts`.
 */
import { appleAppSiteAssociation } from "@/lib/native-links";

export function GET() {
  const body = appleAppSiteAssociation(process.env);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
