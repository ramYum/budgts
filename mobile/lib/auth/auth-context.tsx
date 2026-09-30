import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { reauthVerdict } from "./reauth-guard";

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

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // A re-sign-in that came back as another account is never shown: sign this phone out (lib/auth/reauth-guard.ts).
      // Local scope: the other account's sessions elsewhere are theirs. Deferred: the listener must not call back into
      // supabase-js while it is still announcing.
      if (reauthVerdict(event, nextSession?.user.id ?? null) === "reject") {
        setTimeout(() => void supabase.auth.signOut({ scope: "local" }), 0);
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
