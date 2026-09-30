import { useState } from "react";
import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import {
  NEW_CATEGORY_COLOR,
  categoryGroups,
  monthCountLine,
  type CategoryFields,
  type CategorySettings,
  type CategoryWrite,
  type ManagedCategory,
} from "../../lib/categories/manage";
import { Button, Field } from "../brand/controls";
import { Text } from "../brand/text";
import { Overlay } from "../kit/overlay";
import { PageHeader } from "../kit/page-header";
import { RowMenu } from "../kit/row-menu";
import { SectionHead } from "../kit/section-head";
import { Select } from "../kit/select";
import { CategoryIcon } from "../kit/tiles";
import { RowsCard } from "./rows-card";

export type CategoryActions = {
  /** a new category; `requestId` stays the same for every try in one sheet, so a retry lands once */
  create: (fields: CategoryFields, requestId: string) => Promise<CategoryWrite>;
  newRequestId: () => string;
  update: (id: string, fields: CategoryFields) => Promise<CategoryWrite>;
  setArchived: (id: string, archived: boolean) => Promise<CategoryWrite>;
  /** Activity, this month, filtered to the category (web `/transactions?m=…&category=…`) */
  openCategory: (id: string, month: string) => void;
};

const KINDS = [
  { value: "expense" as const, label: "Expense" },
  { value: "income" as const, label: "Income" },
];

/**
 * The category form (web category-form.tsx), in the bottom sheet: Name, Type,
 * the form's message, then the action and Cancel. A new category takes the
 * palette's first colour; an edit keeps its own.
 */
export function CategoryForm({
  initial,
  submitLabel,
  save,
  onDone,
}: {
  initial?: ManagedCategory;
  submitLabel: string;
  save: (fields: CategoryFields) => Promise<CategoryWrite>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">(initial?.kind ?? "expense");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    const result = await save({ name, kind, color: initial?.color ?? NEW_CATEGORY_COLOR });
    setPending(false);
    if (result.ok) onDone();
    else setMessage(result.fieldError ?? result.error ?? null);
  }

  return (
    <View style={{ gap: 16 }}>
      <Field
        testID="category-name"
        label="Name"
        value={name}
        onChangeText={setName}
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Select testID="category-kind" label="Type" value={kind} options={KINDS} onChange={setKind} />
      {message ? (
        <Text testID="category-form-error" variant="body" color={ROLE.neg} accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
        <Button testID="category-save" loading={pending} onPress={() => void submit()} style={{ flex: 1 }}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button testID="category-cancel" variant="secondary" onPress={onDone}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

function Row({
  cat,
  month,
  actions,
  onEdit,
  onFailed,
}: {
  cat: ManagedCategory;
  month: string;
  actions: CategoryActions;
  onEdit: (c: ManagedCategory) => void;
  onFailed: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const archiveLabel = cat.archived ? "Restore" : "Archive";
  const dim = cat.archived ? { opacity: 0.6 } : null;

  async function toggleArchive() {
    setPending(true);
    const result = await actions.setArchived(cat.id, !cat.archived);
    setPending(false);
    onFailed(result.ok ? null : (result.error ?? result.fieldError ?? "Couldn't save the category. Try again."));
  }

  return (
    <View testID="category-row" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={dim}>
        <CategoryIcon name={cat.name} />
      </View>
      <Pressable
        testID={`category-${cat.id}`}
        accessibilityRole="link"
        accessibilityLabel={`${cat.name}, ${monthCountLine(cat.txnCount)}`}
        onPress={() => actions.openCategory(cat.id, month)}
        style={[{ flex: 1, minWidth: 0 }, dim]}
      >
        {({ pressed }) => (
          <>
            <Text variant="listName" color={ROLE.ink} numberOfLines={1} style={pressed ? { textDecorationLine: "underline" } : null}>
              {cat.name}
            </Text>
            <Text variant="meta" color={ROLE.muted} numberOfLines={1}>
              {monthCountLine(cat.txnCount)}
            </Text>
          </>
        )}
      </Pressable>
      <View style={{ marginRight: -8 }}>
        <RowMenu
          testID={`category-menu-${cat.id}`}
          label={`More for ${cat.name}`}
          items={[
            ...(!cat.archived ? [{ label: "Edit", icon: "edit" as const, onSelect: () => onEdit(cat) }] : []),
            { label: archiveLabel, icon: "archive" as const, onSelect: () => void toggleArchive(), disabled: pending },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Settings → Categories (web settings/categories/page.tsx + category-manager.tsx):
 * Add in the header, the hint, then Expense, Income and Archived, each row
 * opening its transactions this month and a menu to edit, archive or restore.
 * Add and Edit open the category form in the bottom sheet.
 */
export function CategoriesView({ data, actions, onBack }: { data: CategorySettings; actions: CategoryActions; onBack: () => void }) {
  const [sheet, setSheet] = useState<{ mode: "add"; requestId: string } | { mode: "edit"; cat: ManagedCategory } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => setSheet(null);

  return (
    <View testID="categories-view">
      <PageHeader
        title="Categories"
        onBack={onBack}
        action={
          <Button testID="categories-add" icon="plus" accessibilityLabel="Add category" onPress={() => setSheet({ mode: "add", requestId: actions.newRequestId() })}>
            Add
          </Button>
        }
      />
      <View style={{ gap: 24 }}>
        <Text variant="body" color={ROLE.muted}>
          Tap a category to see its transactions.
        </Text>
        {failure ? (
          <Text testID="categories-error" variant="body" color={ROLE.neg} accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20 }}>
            {failure}
          </Text>
        ) : null}
        <View style={{ gap: 32 }}>
          {categoryGroups(data.categories).map((g) => (
            <View key={g.key} testID={`categories-${g.key}`} style={{ gap: 12 }}>
              <SectionHead title={g.title} count={g.list.length} />
              <RowsCard pad={10}>
                {g.list.map((c) => (
                  <Row
                    key={c.id}
                    cat={c}
                    month={data.month}
                    actions={actions}
                    onEdit={(cat) => setSheet({ mode: "edit", cat })}
                    onFailed={setFailure}
                  />
                ))}
              </RowsCard>
            </View>
          ))}
        </View>
      </View>

      {sheet?.mode === "add" ? (
        <Overlay title="Add category" onClose={close} testID="category-sheet">
          <CategoryForm submitLabel="Add" save={(fields) => actions.create(fields, sheet.requestId)} onDone={close} />
        </Overlay>
      ) : null}
      {sheet?.mode === "edit" ? (
        <Overlay title="Edit category" onClose={close} testID="category-sheet">
          <CategoryForm initial={sheet.cat} submitLabel="Save changes" save={(fields) => actions.update(sheet.cat.id, fields)} onDone={close} />
        </Overlay>
      ) : null}
    </View>
  );
}
