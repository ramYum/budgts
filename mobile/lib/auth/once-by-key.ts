/**
 * Wraps async work so that concurrent AND later calls with the same key share
 * one execution and one result.
 *
 * Why: an auth `code` / `token_hash` is single-use. On Android the same
 * `budgts://auth/callback?...` URL reaches the app twice — once as the result
 * of `WebBrowser.openAuthSessionAsync` (sign-in.tsx) and once as an intent
 * routed to `app/auth/callback.tsx`. Exchanging it twice makes the loser fail
 * with "invalid flow state" even though the session was established.
 *
 * A rejection is NOT cached, so a genuine network failure can be retried.
 */
export function onceByKey<T>(work: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const results = new Map<string, Promise<T>>();

  return (key) => {
    const existing = results.get(key);
    if (existing) return existing;

    const started = work(key).catch((err: unknown) => {
      results.delete(key);
      throw err;
    });
    results.set(key, started);
    return started;
  };
}
