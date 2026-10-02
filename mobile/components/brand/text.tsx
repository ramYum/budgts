import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { ROLE, type TypeRoleName } from "../../lib/brand/shared";
import { isPixelRole, pixelSpaceLetterSpacing, splitSpaces, textStyle } from "../../lib/brand/type";
import { useRoleColor } from "./on-backdrop";

export type BrandTextProps = Omit<TextProps, "style"> & {
  /** a type role from the shared tokens: the web's `.px-*` / `.t-*` classes and reading styles */
  variant: TypeRoleName;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Text in one of the brand's type roles (src/lib/brand/tokens.ts TYPE), in
 * the web's font files. Dogica roles narrow each space by a quarter em, as the
 * web's `word-spacing: -0.25em` does, so titles set to the same width. The
 * muted role reads deeper straight on the sunset backdrop (./on-backdrop.ts).
 */
export function Text({ variant, color = ROLE.text, style, children, ...rest }: BrandTextProps) {
  const base = [textStyle(variant), { color: useRoleColor(color) }, style];
  if (isPixelRole(variant) && typeof children === "string") {
    const spacing = pixelSpaceLetterSpacing(variant);
    return (
      <RNText {...rest} style={base}>
        {splitSpaces(children).map((part, i) =>
          part.space ? (
            <RNText key={i} style={{ letterSpacing: spacing }}>
              {part.text}
            </RNText>
          ) : (
            part.text
          ),
        )}
      </RNText>
    );
  }
  return (
    <RNText {...rest} style={base}>
      {children}
    </RNText>
  );
}
