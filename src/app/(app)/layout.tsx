import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Auth gate for everything under `(app)`. Proxy also redirects, this is the
 * server-side backstop and gives child pages a guaranteed session. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return children;
}
