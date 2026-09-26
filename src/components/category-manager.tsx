"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Overlay } from "./overlay";
import { CategoryForm, type CategoryInitial } from "./category-form";
import { RowMenu } from "./row-menu";
import { Button, CategoryIcon, SectionHead, TextButton } from "./ui";
import { createCategory, setCategoryArchived, updateCategory } from "@/server/categories";

export type CategoryItem = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  is_archived: boolean;
  /** transactions in it this month */
  txnCount: number;
};

function Row({
  cat,
  onEdit,
  currentMonth,
}: {
  cat: CategoryItem;
  onEdit: (c: CategoryItem) => void;
  currentMonth: string;
}) {
  const [pending, start] = useTransition();
  const archiveLabel = cat.is_archived ? "Restore" : "Archive";

  const toggleArchive = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("archived", cat.is_archived ? "0" : "1");
      await setCategoryArchived({}, fd);
    });
  };

  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 md:gap-4">
      <span className={cat.is_archived ? "opacity-60" : ""}>
        <CategoryIcon name={cat.name} />
      </span>
      <Link
        href={`/transactions?m=${currentMonth}&category=${cat.id}`}
        className={`group min-w-0 flex-1 ${cat.is_archived ? "opacity-60" : ""}`}
      >
        <span className="block truncate text-[15px] font-medium leading-6 text-ink group-hover:underline">
          {cat.name}
        </span>
        <span className="block truncate text-[13px] leading-5 text-muted">
          {cat.txnCount === 0
            ? "Nothing this month"
            : `${cat.txnCount} ${cat.txnCount === 1 ? "transaction" : "transactions"} this month`}
        </span>
      </Link>
      <div className="hidden items-center gap-4 md:flex">
        {!cat.is_archived ? (
          <TextButton icon="edit" onClick={() => onEdit(cat)} aria-label={`Edit ${cat.name}`}>
            Edit
          </TextButton>
        ) : null}
        <TextButton
          icon="archive"
          onClick={toggleArchive}
          disabled={pending}
          aria-label={`${archiveLabel} ${cat.name}`}
        >
          {archiveLabel}
        </TextButton>
      </div>
      <span className="-mr-2 md:hidden">
        <RowMenu
          label={`More for ${cat.name}`}
          items={[
            ...(!cat.is_archived ? [{ label: "Edit", icon: "edit" as const, onSelect: () => onEdit(cat) }] : []),
            { label: archiveLabel, icon: "archive", onSelect: toggleArchive, disabled: pending },
          ]}
        />
      </span>
    </li>
  );
}

/** The screen's primary action: a new category. */
export function AddCategoryButton() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button icon="plus" onClick={() => setAdding(true)} aria-label="Add category">
        <span className="md:hidden">Add</span>
        <span className="hidden md:inline">Add category</span>
      </Button>
      {adding ? (
        <Overlay title="Add category" onClose={() => setAdding(false)}>
          <CategoryForm action={createCategory} onDone={() => setAdding(false)} submitLabel="Add" />
        </Overlay>
      ) : null}
    </>
  );
}

export function CategoryManager({
  categories,
  currentMonth,
}: {
  categories: CategoryItem[];
  currentMonth: string;
}) {
  const [editing, setEditing] = useState<CategoryItem | null>(null);

  const active = categories.filter((c) => !c.is_archived);
  const groups = [
    { key: "expense", title: "Expense", list: active.filter((c) => c.kind === "expense") },
    { key: "income", title: "Income", list: active.filter((c) => c.kind === "income") },
    { key: "archived", title: "Archived", list: categories.filter((c) => c.is_archived) },
  ].filter((g) => g.list.length > 0);

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <SectionHead title={g.title} count={g.list.length} />
          <ul className="px-card px-rows p-2 md:p-4">
            {g.list.map((c) => (
              <Row key={c.id} cat={c} currentMonth={currentMonth} onEdit={setEditing} />
            ))}
          </ul>
        </section>
      ))}

      {editing ? (
        <Overlay title="Edit category" onClose={() => setEditing(null)}>
          <CategoryForm
            action={updateCategory}
            initial={editing as CategoryInitial}
            onDone={() => setEditing(null)}
            submitLabel="Save changes"
          />
        </Overlay>
      ) : null}
    </div>
  );
}
