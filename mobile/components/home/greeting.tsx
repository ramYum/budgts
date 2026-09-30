import { View } from "react-native";
import { ROLE } from "../../lib/brand/shared";
import { greetingWords } from "../../lib/home/view";
import { Text } from "../brand/text";
import { Rise } from "../motion/rise";

/** A Dogica Bold space is 16px at the title size, narrowed a quarter em by the web's `word-spacing: -0.25em`. */
export const TITLE_WORD_GAP = 12;

/**
 * Home's title (web `<Greeting>`, src/components/local-time.tsx): "Good
 * afternoon, Alex." by the device's own hour, each word rising in turn (70ms
 * apart from 60ms). One heading to a screen reader. The kit PageHeader holds it.
 */
export function Greeting({ hour, name }: { hour: number; name: string }) {
  const words = greetingWords(hour, name);
  return (
    <View
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
  );
}

/** The line under it, rising at 340ms (web `rise inline-block`, `--at: 340ms`). */
export function GreetingSubtitle({ text }: { text: string }) {
  return (
    <Rise at={340} style={{ alignSelf: "flex-start" }}>
      <Text variant="body" color={ROLE.muted} style={{ lineHeight: 20 }}>
        {text}
      </Text>
    </Rise>
  );
}
