import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { LargeSecureStore } from "./large-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)",
  );
}

/**
 * `@supabase/supabase-js` directly (not `@supabase/ssr`) — mobile has no
 * cookies/middleware, per docs/specs/2026-09-17-mobile-app-launch-design.md
 * §4. `flowType: "pkce"` is required for both OAuth and magic-link email
 * confirmation to complete via a deep link on a native client rather than a
 * browser redirect with a URL fragment.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
