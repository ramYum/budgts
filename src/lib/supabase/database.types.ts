/**
 * Hand-introspected substitute for `supabase gen types typescript`.
 *
 * The official generator's `--db-url`/`--project-id` paths both shell out
 * to a local `postgres-meta` Docker container for introspection, and
 * Docker isn't available in this environment — confirmed on both the
 * current CLI and an older (1.226.4) version, same failure. This file was
 * produced instead by querying `information_schema.columns` and
 * `pg_enum` directly against staging (`budgts-staging`, project ref
 * `iwypmifvmtmkwtnxkfma`) and hand-transcribing the result — not guessed.
 *
 * Scope: `public.transactions` only, the table the finding this file
 * closes (qualify-integration final review, Important #2) is about. Once
 * Docker is available, replace this whole file with the real
 * `supabase gen types typescript --db-url "$DIRECT_URL" --schema public`
 * output — same access path (`Database["public"]["Tables"]["transactions"]["Row"]`),
 * so no call site needs to change.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          category_id: string | null;
          amount: number;
          direction: "debit" | "credit";
          occurred_at: string;
          description: string;
          note: string | null;
          source: "manual" | "email" | "receipt" | "bank";
          source_ref: string | null;
          status: "confirmed" | "pending_review";
          is_transfer: boolean;
          created_at: string;
          plaid_account_id: string | null;
          pending: boolean;
          pending_plaid_transaction_id: string | null;
          merchant_name: string | null;
          merchant_entity_id: string | null;
          plaid_category_primary: string | null;
          plaid_category_detailed: string | null;
          plaid_pfc_confidence: string | null;
          user_categorized: boolean;
          removed_at: string | null;
          authorized_at: string | null;
          transfer_pair_id: string | null;
          recurring_stream_id: string | null;
          raw: Json | null;
          content_fingerprint: string | null;
          duplicate_of_id: string | null;
          pending_reason: string | null;
          /**
           * DB CHECK-constrained (`transactions_event_role_valid`, migration
           * 0011) to one of the defined Event Role values or NULL — but
           * Postgres `text` codegens as plain `string`, not a literal union;
           * this type cannot express the constraint. countsForMonth's
           * `isEventRole` runtime guard is what actually protects a
           * malformed value at read time (design: 2026-09-12
           * qualify-integration final review, Important #2).
           */
          event_role: string | null;
          transfer_user_set: boolean;
        };
      };
    };
  };
}
