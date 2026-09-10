/**
 * DELETE /api/plaid/item — disconnect a Plaid Item. Design §24.
 *
 * Body: `{ itemId: string, purge?: boolean }`
 *  - default (disconnect): `/item/remove` at Plaid, then delete the
 *    `plaid_items` row (cascades `plaid_accounts`). **Imported transactions are
 *    kept** — `transactions.plaid_account_id` is `ON DELETE SET NULL`.
 *  - `purge: true` ("delete my bank data"): the above, PLUS hard-delete the
 *    `source = 'bank'` rows for this item's accounts. Destructive, explicit.
 *
 * The teardown itself lives in `src/server/plaid/disconnect.ts`, shared with
 * the `disconnectBank` server action.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { disconnectPlaidItem } from "@/server/plaid/disconnect";
import { createClient, getSessionUser } from "@/lib/supabase/server";

const Body = z.object({ itemId: z.string().min(1), purge: z.boolean().optional() });

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = await createClient();
  const result = await disconnectPlaidItem(supabase, {
    userId: user.id,
    itemId: parsed.data.itemId,
    purge: parsed.data.purge,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, purged: result.purged });
}
