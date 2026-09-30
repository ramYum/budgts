import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { setAuthStore } from "./persisted";
import { reauthVerdict, signOutFailed, startupVerdict } from "./reauth-guard";
import { hydrateReturnIntent } from "./return-intent";
import { secureKv } from "./secure-kv";

// The re-sign-in facts that must survive the process live in secure storage (lib/auth/persisted.ts).
setAuthStore(secureKv);

/**
 * Signs this phone out of a refused session (lib/auth/reauth-guard.ts), locally: the other account's sessions
 * elsewhere are theirs. If that fails (G2), sign-in says so; the refused session may still be stored, and the next
 * launch refuses it again (the stored expectation is only cleared by a completed sign-out).
 */
async function signOutRefused(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) return true;
  } catch {
    // reported below
  }
  signOutFailed();
  return false;
}

type AuthContextValue = {
  session: Session | null;
  /** True until the initial `getSession()` read from secure storage resolves. */
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let started = false;

    // Launch: before the stored session reaches any screen, finish what a killed process left (a re-sign-in's
    // expectation, the return intent). A stored session for another account than the one re-signing in is refused.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const [verdict] = await Promise.all([startupVerdict(data.session?.user.id ?? null), hydrateReturnIntent()]);
      if (verdict === "reject") await signOutRefused();
      if (cancelled) return;
      started = true;
      setSession(verdict === "reject" ? null : data.session);
      setLoading(false);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // The launch read above decides the first session; its INITIAL_SESSION echo is not a second source.
      if (!started && event === "INITIAL_SESSION") return;
      // A re-sign-in that came back as another account is never shown: sign this phone out. Deferred: the listener
      // must not call back into supabase-js while it is still announcing. If the sign-out fails, show nobody.
      if (reauthVerdict(event, nextSession?.user.id ?? null) === "reject") {
        setTimeout(() => {
          void signOutRefused().then((ok) => {
            if (!ok && !cancelled) setSession(null);
          });
        }, 0);
        return;
      }
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
