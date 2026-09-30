import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { greetingWords } from "../../lib/home/view";
import { Text } from "../brand/text";
import { MonthNav } from "../kit/month-nav";
import { Rise } from "./rise";

/** A Dogica Bold space is 16px at the title size, narrowed a quarter em by the web's `word-spacing: -0.25em`. */
export const TITLE_WORD_GAP = 12;

/**
 * Home's header (web `PageHeader` with `<Greeting>`, the subtitle and
 * `<MonthNav>`, phone layout): "Good afternoon, Alex." rises word by word
 * (70ms apart from 60ms), the line under it at 340ms, and the month switcher
 * sits on its own row 16px below. The space under it is Home's to set (the
 * web's margins collapse there). The layout is kit/page-header.tsx's; the
 * title is words, not one string, so each can rise on its own.
 */
export function HomeHeader({
  hour,
  name,
  subtitle,
  month,
  onMonth,
}: {
  /** the device's hour: the greeting follows the user's own clock, as the web's does */
  hour: number;
  name: string;
  subtitle: string;
  month: string;
  onMonth: (month: string) => void;
}) {
  const words = greetingWords(hour, name);
  return (
    <View testID="page-header" style={{ gap: 16 }}>
      <View style={{ minHeight: 40, justifyContent: "center" }}>
        <View
          testID="page-title"
          accessible
          accessibilityRole="header"
          accessibilityLabel={words.join(" ")}
          style={{ flexDirection: "row", flexWrap: "wrap", columnGap: TITLE_WORD_GAP }}
        >
          {words.map((word, i) => (
            <Rise key={i} at={i * 70 + 60}>
              <Text variant="pxTitle" color={ROLE.ink}>
                {word}
              </Text>
            </Rise>
          ))}
        </View>
        <Rise at={340} style={{ marginTop: 4, alignSelf: "flex-start" }}>
          <Text testID="page-subtitle" variant="body" color={ROLE.muted} style={{ lineHeight: 20 }}>
            {subtitle}
          </Text>
        </Rise>
      </View>
      <MonthNav month={month} onChange={onMonth} />
    </View>
  );
}
