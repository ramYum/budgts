/**
 * GET /.well-known/assetlinks.json — the Android app-link (Digital Asset Links) association.
 * 404 until `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_SHA256` are configured; see `src/lib/native-links.ts`.
 */
import { assetLinks } from "@/lib/native-links";

export function GET() {
  const body = assetLinks(process.env);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
