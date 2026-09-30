import { useState } from "react";
import { Pressable, View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import {
  categoryGroups,
  monthCountLine,
  type CategoryFields,
  type CategorySettings,
  type CategoryWrite,
  type ManagedCategory,
} from "../../lib/categories/manage";
import { Button } from "../brand/controls";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { RowMenu } from "../kit/row-menu";
import { SectionHead } from "../kit/section-head";
import { CategoryIcon } from "../kit/tiles";
import { CategorySheet } from "./category-form";
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
  const [sheet, setSheet] = useState<{ mode: "add" } | { mode: "edit"; cat: ManagedCategory } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => setSheet(null);

  return (
    <View testID="categories-view">
      <PageHeader
        title="Categories"
        onBack={onBack}
        action={
          <Button testID="categories-add" icon="plus" accessibilityLabel="Add category" onPress={() => setSheet({ mode: "add" })}>
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
        <CategorySheet
          title="Add category"
          submitLabel="Add"
          newRequestId={actions.newRequestId}
          save={(fields, requestId) => actions.create(fields, requestId!)}
          onDone={close}
        />
      ) : null}
      {sheet?.mode === "edit" ? (
        <CategorySheet
          title="Edit category"
          submitLabel="Save changes"
          initial={sheet.cat}
          save={(fields) => actions.update(sheet.cat.id, fields)}
          onDone={close}
        />
      ) : null}
    </View>
  );
}
