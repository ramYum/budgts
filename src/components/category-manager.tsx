"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Overlay } from "./overlay";
import { CategoryForm, type CategoryInitial } from "./category-form";
import { createCategory, setCategoryArchived, updateCategory } from "@/server/categories";

export type CategoryItem = {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  is_archived: boolean;
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

  const toggleArchive = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("archived", cat.is_archived ? "0" : "1");
      await setCategoryArchived({}, fd);
    });
  };

  return (
    <li className={`flex items-center gap-3 py-2 ${cat.is_archived ? "opacity-50" : ""}`}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat.color }} aria-hidden />
      <Link
        href={`/transactions?m=${currentMonth}&category=${cat.id}`}
        className="min-w-0 flex-1 truncate text-sm hover:underline"
      >
        {cat.name}
      </Link>
      {!cat.is_archived ? (
        <button type="button" onClick={() => onEdit(cat)} className="text-xs text-muted hover:text-text">
          Edit
        </button>
      ) : null}
      <button
        type="button"
        onClick={toggleArchive}
        disabled={pending}
        className="text-xs text-muted hover:text-text disabled:opacity-50"
      >
        {cat.is_archived ? "Restore" : "Archive"}
      </button>
    </li>
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
  const [adding, setAdding] = useState(false);

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const section = (label: string, list: CategoryItem[]) => (
    <div className="space-y-1 px-4 py-3">
      <h3 className="text-xs font-medium text-muted">{label}</h3>
      <ul className="divide-y divide-hairline">
        {list.map((c) => (
          <Row key={c.id} cat={c} currentMonth={currentMonth} onEdit={setEditing} />
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
          Categories
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          + Add
        </button>
      </div>
      <p className="text-xs text-muted">Tap a category to see its transactions.</p>

      <div className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {section("Expense", expense)}
        {income.length ? section("Income", income) : null}
      </div>

      {adding ? (
        <Overlay title="Add category" onClose={() => setAdding(false)}>
          <CategoryForm action={createCategory} onDone={() => setAdding(false)} submitLabel="Add" />
        </Overlay>
      ) : null}
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
    </section>
  );
}
