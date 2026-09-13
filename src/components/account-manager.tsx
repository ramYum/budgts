"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Overlay } from "./overlay";
import { ACCOUNT_TYPES } from "@/lib/validation/account";
import {
  createAccount,
  setAccountArchived,
  updateAccount,
  type AccountActionState,
} from "@/server/accounts";

export type AccountItem = {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  is_archived: boolean;
};

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

function AccountForm({
  action,
  initial,
  onDone,
  submitLabel,
}: {
  action: (prev: AccountActionState, fd: FormData) => Promise<AccountActionState>;
  initial?: AccountItem;
  onDone: () => void;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(action, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  return (
    <form action={formAction} className="space-y-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label className="block space-y-1 text-xs font-medium text-muted">
        Name
        <input className={field} name="name" defaultValue={initial?.name ?? ""} maxLength={40} required autoFocus />
      </label>
      <label className="block space-y-1 text-xs font-medium text-muted">
        Type
        <select className={field} name="type" defaultValue={initial?.type ?? "checking"}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onDone} className="rounded-full border border-border px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AccountManager({ accounts }: { accounts: AccountItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccountItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const toggle = (a: AccountItem) => {
    start(async () => {
      const fd = new FormData();
      fd.set("id", a.id);
      fd.set("archived", a.is_archived ? "0" : "1");
      await setAccountArchived({}, fd);
      router.refresh();
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
          Accounts
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          + Add
        </button>
      </div>
      <ul className="card divide-y divide-hairline rounded-2xl border border-hairline px-4">
        {accounts.map((a) => (
          <li key={a.id} className={`flex items-center gap-3 py-2 ${a.is_archived ? "opacity-50" : ""}`}>
            <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
            <span className="text-xs text-muted">{a.type}</span>
            {!a.is_archived ? (
              <button type="button" onClick={() => setEditing(a)} className="text-xs text-muted hover:text-text">
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => toggle(a)}
              disabled={pending}
              className="text-xs text-muted hover:text-text disabled:opacity-50"
            >
              {a.is_archived ? "Restore" : "Archive"}
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <Overlay title="Add account" onClose={() => setAdding(false)}>
          <AccountForm action={createAccount} onDone={() => setAdding(false)} submitLabel="Add" />
        </Overlay>
      ) : null}
      {editing ? (
        <Overlay title="Edit account" onClose={() => setEditing(null)}>
          <AccountForm
            action={updateAccount}
            initial={editing}
            onDone={() => setEditing(null)}
            submitLabel="Save changes"
          />
        </Overlay>
      ) : null}
    </section>
  );
}
