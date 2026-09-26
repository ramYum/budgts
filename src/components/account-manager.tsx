"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { Overlay } from "./overlay";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/accounts/account-types";
import {
  createAccount,
  setAccountArchived,
  updateAccount,
  type AccountActionState,
} from "@/server/accounts";
import type { IconName } from "./icon";
import { RowMenu } from "./row-menu";
import { Badge, Button, IconTile, SectionHead, Select, TextButton, fieldClass, labelClass } from "./ui";

export type AccountItem = {
  id: string;
  name: string;
  type: AccountType;
  is_archived: boolean;
  /** the bank's last four, for a linked account */
  mask?: string | null;
  /** transactions this month (the Activity list's count for the account) */
  txnCount: number;
};

export type AccountGroup = {
  key: string;
  title: string;
  /** a linked bank's connection state; none for accounts added by hand */
  status?: "connected" | "attention";
  accounts: AccountItem[];
};

const TYPE_ICON: Record<AccountType, IconName> = {
  checking: "wallet",
  credit: "credit-card",
  savings: "coins",
  cash: "wallet",
};

const typeLabel = (t: AccountType) => t[0]!.toUpperCase() + t.slice(1);

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
  useEffect(() => {
    if (state.ok) {
      onDone();
    }
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label className={labelClass}>
        Name
        <input className={fieldClass} name="name" defaultValue={initial?.name ?? ""} maxLength={40} required autoFocus />
      </label>
      <label className={labelClass}>
        Type
        <Select name="type" defaultValue={initial?.type ?? "checking"}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </Select>
      </label>
      {state.fieldError || state.error ? (
        <p className="text-sm text-neg">{state.fieldError ?? state.error}</p>
      ) : null}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The screen's primary action: add an account kept by hand (cash, a card
 * the bank can't reach). */
export function AddAccountButton() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button icon="plus" onClick={() => setAdding(true)} aria-label="Add account">
        <span className="md:hidden">Add</span>
        <span className="hidden md:inline">Add account</span>
      </Button>
      {adding ? (
        <Overlay title="Add account" onClose={() => setAdding(false)}>
          <AccountForm action={createAccount} onDone={() => setAdding(false)} submitLabel="Add" />
        </Overlay>
      ) : null}
    </>
  );
}

function AccountRow({
  a,
  pending,
  onEdit,
  onToggle,
}: {
  a: AccountItem;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const archiveLabel = a.is_archived ? "Restore" : "Archive";
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 md:gap-4">
      <IconTile name={TYPE_ICON[a.type] ?? "wallet"} />
      <div className={`min-w-0 flex-1 ${a.is_archived ? "opacity-60" : ""}`}>
        <p className="truncate text-[15px] font-medium leading-6 text-ink">
          {a.name}
          {a.mask && !a.name.includes(a.mask) ? <span className="tnum"> ••{a.mask}</span> : null}
        </p>
        <p className="truncate text-[13px] leading-5 text-muted">
          {typeLabel(a.type)} ·{" "}
          {a.txnCount === 0
            ? "nothing this month"
            : `${a.txnCount} ${a.txnCount === 1 ? "transaction" : "transactions"} this month`}
        </p>
      </div>
      <div className="hidden items-center gap-4 md:flex">
        {!a.is_archived ? (
          <TextButton icon="edit" onClick={onEdit} aria-label={`Edit ${a.name}`}>
            Edit
          </TextButton>
        ) : null}
        <TextButton icon="archive" onClick={onToggle} disabled={pending} aria-label={`${archiveLabel} ${a.name}`}>
          {archiveLabel}
        </TextButton>
      </div>
      <span className="-mr-2 md:hidden">
        <RowMenu
          label={`More for ${a.name}`}
          items={[
            ...(!a.is_archived ? [{ label: "Edit", icon: "edit" as const, onSelect: onEdit }] : []),
            { label: archiveLabel, icon: "archive", onSelect: onToggle, disabled: pending },
          ]}
        />
      </span>
    </li>
  );
}

export function AccountManager({ groups, archived }: { groups: AccountGroup[]; archived: AccountItem[] }) {
  const [editing, setEditing] = useState<AccountItem | null>(null);
  const [pending, start] = useTransition();

  const toggle = (a: AccountItem) => {
    start(async () => {
      const fd = new FormData();
      fd.set("id", a.id);
      fd.set("archived", a.is_archived ? "0" : "1");
      await setAccountArchived({}, fd);
    });
  };

  const section = (key: string, title: string, list: AccountItem[], aside?: ReactNode) => (
    <section key={key} className="space-y-3">
      <SectionHead title={title} aside={aside} />
      <ul className="px-card px-rows p-2 md:p-4">
        {list.map((a) => (
          <AccountRow key={a.id} a={a} pending={pending} onEdit={() => setEditing(a)} onToggle={() => toggle(a)} />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-8">
      {groups.map((g) =>
        section(
          g.key,
          g.title,
          g.accounts,
          g.status === "connected" ? (
            <Badge tone="growth" icon="check">
              Connected
            </Badge>
          ) : g.status === "attention" ? (
            <Badge tone="wash" icon="warning">
              Needs attention
            </Badge>
          ) : undefined,
        ),
      )}
      {archived.length > 0 ? section("archived", "Archived", archived) : null}

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
    </div>
  );
}
