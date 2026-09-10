/**
 * POST /api/plaid/webhook — inbound Plaid webhook. Verify the signature, log
 * the event, and set `needs_sync` / an item status. Fast, no syncing here.
 * Design §20.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { plaidWebhookEvents } from "@/lib/db/schema";
import { findItemByPlaidItemId, markItemNeedsSync, setItemStatus } from "@/lib/plaid/item-store";
import { classifyWebhook, type PlaidWebhookEvent } from "@/lib/plaid/webhook-dispatch";
import { verifyPlaidWebhook } from "@/lib/plaid/webhook-verify";
import { getWebhookVerificationKey, plaidDb } from "@/server/plaid/service";

export async function POST(request: Request) {
  const raw = await request.text();
  const jwt = (await headers()).get("plaid-verification");

  const verification = await verifyPlaidWebhook({ rawBody: raw, jwt, getKey: getWebhookVerificationKey });

  let event: PlaidWebhookEvent | null = null;
  try {
    event = JSON.parse(raw) as PlaidWebhookEvent;
  } catch {
    // still logged below
  }

  const [logged] = await plaidDb
    .insert(plaidWebhookEvents)
    .values({
      verified: verification.ok,
      webhookType: event?.webhook_type ?? null,
      webhookCode: event?.webhook_code ?? null,
      itemId: event?.item_id ?? null,
      payload: (event as unknown) ?? { unparseable: raw.slice(0, 500) },
      handled: false,
      error: verification.ok ? null : verification.reason,
    })
    .returning({ id: plaidWebhookEvents.id });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }
  if (!event?.item_id) {
    return NextResponse.json({ ok: true, note: "no item_id" });
  }

  const item = await findItemByPlaidItemId(plaidDb, event.item_id);
  if (!item) return NextResponse.json({ ok: true, note: "unknown item" });

  const action = classifyWebhook(event);
  if (action.kind === "needs_sync") {
    await markItemNeedsSync(plaidDb, event.item_id);
  } else if (action.kind === "set_status") {
    await setItemStatus(plaidDb, event.item_id, action.status, action.errorCode);
  }

  await plaidDb
    .update(plaidWebhookEvents)
    .set({ handled: true })
    .where(eq(plaidWebhookEvents.id, logged.id));

  return NextResponse.json({ ok: true, action: action.kind });
}
