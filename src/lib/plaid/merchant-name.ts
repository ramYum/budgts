/**
 * Deterministic merchant-name normalization for the categorization evidence
 * chain (design §18). Pure — no I/O, no fuzzy matching. The output is only ever
 * compared by **exact string equality** against `MERCHANT_KNOWLEDGE` keys, so
 * over-stripping (which would merge distinct merchants) is worse than
 * under-stripping (which just falls through to the PFC layers).
 *
 * Not a display formatter — the UI shows the raw `merchant_name`. This is a
 * match key only.
 */

/** Card-network / processor / aggregator prefixes that carry no merchant identity. */
const PREFIXES = [
  "sq *",
  "sq*",
  "tst* ",
  "tst*",
  "tst ",
  "pp*",
  "pp* ",
  "paypal *",
  "pos ",
  "dd *",
  "dd*",
  "chkcard ",
  "purchase ",
  "sp * ",
  "sp *",
  "in *",
  "ext ",
];

/** Corp suffixes stripped from the tail (token boundary). `co` only after another word. */
const TRAILING_SUFFIX_RE = /(?: (?:inc|llc|corp|ltd|company|plc|co))+$/;

/** A dotted host token, e.g. `help.uber.com` or `netflix.com`. */
const HOST_TOKEN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/g;
const WHOLE_HOST_RE = /^([a-z0-9-]+)(?:\.[a-z0-9-]+)+$/;

/**
 * Normalize a raw Plaid merchant string to a lookup key.
 *
 * Guarantees:
 *  - lowercased, trimmed, single-spaced, only `[a-z0-9 ]`
 *  - `null` / `undefined` / blank → `""`
 *  - idempotent: `f(f(x)) === f(x)`
 *  - `"UBER   EATS"` → `"uber eats"` (never collapsed to `"uber"`)
 */
export function normalizeMerchantName(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";

  // 1. Strip a leading processor prefix (once).
  for (const p of PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }

  // 2. Drop full URLs — BEFORE `/` becomes a separator in step 3.
  s = s.replace(/\bhttps?:\/\/\S+/g, " ");

  // 3. `*` `/` `\` are separators, not identity.
  s = s.replace(/[*/\\]+/g, " ");

  // 4. Apostrophes join ("mcdonald's" → "mcdonalds").
  s = s.replace(/['`’]/g, "");

  // 5. Hosts. A bare hostname keeps its first label ("netflix.com" → "netflix",
  //    "help.uber.com" → "help"); an embedded host token is noise, dropped whole.
  s = s.trim();
  const whole = s.match(WHOLE_HOST_RE);
  if (whole) {
    s = whole[1];
  } else {
    s = s.replace(HOST_TOKEN_RE, " ");
  }

  // 6. Store / location numbers.
  s = s
    .replace(/#\s*\d+/g, " ")
    .replace(/\bstore\s*#?\s*\d+\b/g, " ")
    .replace(/ \d{3,}\b/g, " ");

  // 7. Everything that isn't a letter/digit is a separator; collapse.
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  // 8. Trailing corp suffixes (after collapse, so token boundaries are clean).
  s = s.replace(TRAILING_SUFFIX_RE, "").trim();

  return s;
}
