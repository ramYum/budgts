import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewTransactionRow, TransactionRow, TransactionSource, TransactionStore } from "./types";

/** TransactionStore backed by the user's Supabase client (RLS-enforced). */
export function supabaseTransactionStore(supabase: SupabaseClient): TransactionStore {
  return {
    async findExisting(userId: string, source: TransactionSource, sourceRef: string) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .eq("source", source)
        .eq("source_ref", sourceRef)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as TransactionRow | null) ?? null;
    },

    async insert(row: NewTransactionRow) {
      const { data, error } = await supabase
        .from("transactions")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as TransactionRow;
    },
  };
}
