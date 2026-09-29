/**
 * A PostgREST stand-in for loader / command unit tests: every `from(table)` chain records its calls (`["eq","id","x"]`,
 * `["insert",{...}]`, ...) and, when awaited (directly or through `.single()` / `.maybeSingle()`), resolves to whatever
 * `answer(table, calls)` returns. Nothing is filtered for real: a test answers exactly what the database would.
 */
export type FakeResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };
export type FakeCall = unknown[];
export type FakeLog = { table: string; calls: FakeCall[] }[];

export function fakeSupabase(answer: (table: string, calls: FakeCall[]) => FakeResult) {
  const log: FakeLog = [];
  const supabase = {
    from: (table: string) => {
      const calls: FakeCall[] = [];
      log.push({ table, calls });
      const resolve = () => {
        const r = answer(table, calls);
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
      };
      const q: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => resolve().then(ok, bad);
            return (...args: unknown[]) => {
              calls.push([String(prop), ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { supabase: supabase as never, log };
}

/** The value of the first call named `name` in a chain (e.g. `arg(calls, "insert")`). */
export function arg(calls: FakeCall[], name: string, index = 1): unknown {
  return calls.find((c) => c[0] === name)?.[index];
}

export const has = (calls: FakeCall[], name: string, ...args: unknown[]) =>
  calls.some((c) => c[0] === name && args.every((a, i) => c[i + 1] === a));
