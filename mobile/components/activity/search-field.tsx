import { useState } from "react";
import { TextInput } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";

/**
 * The Activity search (web `transaction-list.tsx` search bar): a 46px `px-search` frame, the search icon in graphite, a
 * 16/24 input; the frame thickens to ink while typing. It filters as you type, like the web.
 */
export function SearchField({
  value,
  onChangeText,
  testID = "activity-search",
}: {
  value: string;
  onChangeText: (text: string) => void;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <PixelFrame
      testID={testID}
      frame="px-search"
      state={focused ? ":focus-within" : ""}
      style={{ height: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}
    >
      <Icon name="search" color={COLOR.graphite} />
      <TextInput
        testID={`${testID}-input`}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search transactions"
        placeholderTextColor={ROLE.muted}
        accessibilityLabel="Search transactions"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        cursorColor={ROLE.ink}
        selectionColor={COLOR.signal}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          textStyle("input"),
          { flex: 1, minWidth: 0, padding: 0, color: ROLE.ink, textAlignVertical: "center", includeFontPadding: false },
        ]}
      />
    </PixelFrame>
  );
}
