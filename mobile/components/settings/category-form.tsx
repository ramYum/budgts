import { useState } from "react";
import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { CATEGORY_COLORS } from "../../lib/shared";
import { type CategoryFields, type CategoryWrite, type CreatedCategory } from "../../lib/categories/manage";
import { Button, Field } from "../brand/controls";
import { Text } from "../brand/text";
import { Overlay } from "../kit/overlay";
import { Select } from "../kit/select";

/** What an edit starts from (web `CategoryInitial`, less the id the caller already holds). */
export type CategoryInitial = { name: string; kind: "expense" | "income"; color: string };

const KINDS = [
  { value: "expense" as const, label: "Expense" },
  { value: "income" as const, label: "Income" },
];

/**
 * The one category form (web category-form.tsx): Name, Type, the form's
 * message, then the action and Cancel. A new category takes the palette's
 * first colour; an edit keeps its own. On success `onDone` gets the category
 * a create made (`{ id, name }`, from `POST /api/mobile/categories`), as the
 * web's form hands it back; Cancel calls it with nothing.
 *
 * Used by Settings → Categories (Add, Edit) and Activity's "Needs a category"
 * ("New category for <merchant>", "Add & use"). Save with lib/categories/manage.ts
 * `writeCategory` + `createBody`.
 */
export function CategoryForm({
  initial,
  submitLabel,
  save,
  onDone,
}: {
  initial?: CategoryInitial;
  submitLabel: string;
  save: (fields: CategoryFields) => Promise<CategoryWrite>;
  onDone: (created?: CreatedCategory) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">(initial?.kind ?? "expense");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    const result = await save({ name, kind, color: initial?.color ?? CATEGORY_COLORS[0] });
    setPending(false);
    if (result.ok) onDone(result.created);
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
        <Text testID="category-form-error" variant="small" color={ROLE.neg} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, paddingTop: 8 }}>
        <Button testID="category-save" loading={pending} onPress={() => void submit()} style={{ flex: 1 }}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button testID="category-cancel" variant="secondary" onPress={() => onDone()}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

/**
 * The form in the bottom sheet (web `<Overlay title=…><CategoryForm …/></Overlay>`), with the web's title and
 * submit label for each use: "Add category" / "Add", "Edit category" / "Save changes", "New category for
 * <merchant>" / "Add & use". For a create, pass `newRequestId`: the sheet keeps one id for every try, so a retry lands
 * once (`save` receives it). Closing the sheet is a Cancel.
 */
export function CategorySheet({
  title,
  submitLabel,
  initial,
  save,
  newRequestId,
  onDone,
  testID,
}: {
  title: string;
  submitLabel: string;
  initial?: CategoryInitial;
  save: (fields: CategoryFields, requestId: string | undefined) => Promise<CategoryWrite>;
  newRequestId?: () => string;
  onDone: (created?: CreatedCategory) => void;
  /** the sheet's parity id: Settings → Categories' sheets are "category-sheet" (web category-manager), the rest "sheet" */
  testID?: string;
}) {
  const [requestId] = useState(() => newRequestId?.());
  return (
    <Overlay title={title} onClose={() => onDone()} testID={testID}>
      <CategoryForm initial={initial} submitLabel={submitLabel} save={(fields) => save(fields, requestId)} onDone={onDone} />
    </Overlay>
  );
}
