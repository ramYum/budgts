import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Every page is dynamic (per-user, cookie-gated). By default the client
    // router cache keeps dynamic pages for 0s, so each tab tap waited on the
    // server. Reuse a visited page for 30s; server actions and
    // router.refresh() (realtime) still invalidate it.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
