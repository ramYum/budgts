import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { CategoryForm, CategorySheet } from "./category-form";

const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("CategoryForm (web category-form.tsx)", () => {
  it("hands back the category a create made, as the web's form does", async () => {
    const onDone = vi.fn();
    const save = vi.fn(async () => ({ ok: true as const, created: { id: "new-1", name: "Pets" } }));
    const r = render(<CategoryForm submitLabel="Add" save={save} onDone={onDone} />);
    act(() => byTestId(r, "category-name").props.onChangeText("Pets"));
    await press(r, "category-save");
    expect(save).toHaveBeenCalledWith({ name: "Pets", kind: "expense", color: "#8b5cf6" });
    expect(onDone).toHaveBeenCalledWith({ id: "new-1", name: "Pets" });
  });

  it("an edit hands back nothing; Cancel hands back nothing", async () => {
    const onDone = vi.fn();
    const r = render(<CategoryForm submitLabel="Save changes" initial={{ name: "Food", kind: "income", color: "#22c55e" }} save={async () => ({ ok: true })} onDone={onDone} />);
    await press(r, "category-save");
    expect(onDone).toHaveBeenLastCalledWith(undefined);
    await press(r, "category-cancel");
    expect(onDone).toHaveBeenLastCalledWith();
  });

  it("shows the pending label, then the form's message", async () => {
    let finish!: (v: { ok: false; fieldError: string }) => void;
    const r = render(<CategoryForm submitLabel="Add & use" save={() => new Promise((res) => (finish = res))} onDone={() => {}} />);
    expect(byTestId(r, "category-save").props.accessibilityLabel).toBe("Add & use");
    await press(r, "category-save");
    expect(byTestId(r, "category-save").props.accessibilityLabel).toBe("Saving…");
    await act(async () => finish({ ok: false, fieldError: "Name is required" }));
    expect(textContent(byTestId(r, "category-form-error"))).toBe("Name is required");
  });
});

describe("CategorySheet", () => {
  it("takes the web's title and submit label for each use, and keeps one request id for every try", async () => {
    const save = vi.fn().mockResolvedValueOnce({ ok: false, error: "Couldn't save the category. Try again." }).mockResolvedValueOnce({ ok: true, created: { id: "c9", name: "Tacos" } });
    const onDone = vi.fn();
    const newRequestId = vi.fn(() => "req-7");
    const r = render(<CategorySheet title="New category for Taco Bell" submitLabel="Add & use" save={save} newRequestId={newRequestId} onDone={onDone} />);
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("New category for Taco Bell");
    expect(byTestId(r, "category-save").props.accessibilityLabel).toBe("Add & use");
    act(() => byTestId(r, "category-name").props.onChangeText("Tacos"));
    await press(r, "category-save");
    await press(r, "category-save");
    expect(save.mock.calls.map((c) => c[1])).toEqual(["req-7", "req-7"]);
    expect(newRequestId).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ id: "c9", name: "Tacos" });
  });

  it("closing it is a Cancel", async () => {
    const onDone = vi.fn();
    const r = render(<CategorySheet title="Add category" submitLabel="Add" save={async () => ({ ok: true })} onDone={onDone} />);
    await press(r, "sheet-close");
    expect(onDone).toHaveBeenCalledWith();
  });
});
