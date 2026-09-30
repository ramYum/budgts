import { figureSizeOf, type TypeRoleName } from "../../lib/brand/shared";

/**
 * The type role for a screen's one money figure (web `figureSize`, the shared rule in
 * src/lib/brand/figure-size.ts): `t-num-xl` up to 13 characters, `t-num-lg` past them.
 */
export function figureVariant(text: string): Extract<TypeRoleName, "tNumXl" | "tNumLg"> {
  return figureSizeOf(text) === "hero" ? "tNumXl" : "tNumLg";
}
