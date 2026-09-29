import Link from "next/link";
import { Icon } from "@/components/icon";
import { createClient } from "@/lib/supabase/server";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { DELETE_ACCOUNT_PATH } from "@/lib/account/screen";

/**
 * Once a deletion has taken the lock (migration 0021), every write the user makes is refused by the database, and an
 * edit or delete refused that way fails SILENTLY: Postgres just matches no rows. So while an account is locked, every
 * app screen says so, with the one way out: finish the deletion. Asked through the guard's own function
 * (`account_accepts_writes()`, callable by the signed-in user), so the banner and the guard can never disagree.
 * Streams in after the shell (the layout wraps it in <Suspense>), so it never delays a page.
 */
export async function DeletionBanner() {
  // The check is accountWritesLocked, shared with the native app's GET /api/mobile/status.
  if (!(await accountWritesLocked(await createClient()))) return null;
  return <DeletionNotice />;
}

export function DeletionNotice() {
  return (
    // the pages' own column, like the review banner
    <div className="mx-auto w-full max-w-[1136px] px-6 pt-3 md:px-12 md:pt-8">
      <div className="px-wash flex items-start gap-3 p-3 text-[15px] leading-6 text-ink md:p-4" role="status">
        <Icon name="warning" className="text-signal" />
        <p className="text-pretty">
          <span className="font-semibold text-signal-ink">Your account is being deleted.</span> It&apos;s read-only, so
          changes won&apos;t save.{" "}
          <Link href={DELETE_ACCOUNT_PATH} className="font-medium underline underline-offset-2">
            Finish deleting
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
