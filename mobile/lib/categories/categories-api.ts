import { list, obj, oneOf, str } from "../api/parse";

/** The response contract of `GET /api/mobile/categories` (server: `src/lib/mobile/reads.ts`). Read-only: category management is post-launch. */
export type MobileCategory = { id: string; name: string; kind: "expense" | "income"; color: string };

export function parseCategories(body: unknown): MobileCategory[] {
  const b = obj(body, "categories");
  return list(b.categories, "categories", (v, i) => {
    const c = obj(v, `categories[${i}]`);
    return {
      id: str(c.id, "id"),
      name: str(c.name, "name"),
      kind: oneOf(c.kind, "kind", ["expense", "income"] as const),
      color: str(c.color, "color"),
    };
  });
}
