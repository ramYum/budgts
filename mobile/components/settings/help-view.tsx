import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { IconTile } from "../brand/controls";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Robin } from "../brand/robin";
import { Text } from "../brand/text";
import { PageHeader } from "../kit/page-header";
import { pressStyle } from "../kit/press";
import { SectionHead } from "../kit/section-head";
import { Chevron } from "../kit/tiles";

/** The web Help page's questions (help/page.tsx), word for word. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "How does Budgts organize my money?",
    a: "Connect a bank and Budgts imports and categorizes transactions automatically. You can also add anything by hand: cash, or accounts your bank can't reach.",
  },
  {
    q: "What is Money Left?",
    a: "Money Left is what's left after spending is subtracted from income for the month. It doesn't measure a savings-account balance. It's a snapshot of the month's flow.",
  },
  {
    q: "How does categorization work?",
    a: "Budgts files obvious transactions automatically. When it isn't confident, it asks you. Next time it uses your answer for that merchant, as long as it can recognize the store. Some small local shops can't be recognized, so Budgts may ask about them again.",
  },
  {
    q: "What happens if I disconnect a bank?",
    a: "Disconnecting stops new transactions from syncing. Everything already imported stays in your history and keeps counting toward budgets, unless you explicitly choose to delete it.",
  },
  {
    q: "Why is an account excluded from my totals?",
    a: "Only you can exclude an account, and only after Budgts flags it for review, usually because its feed looked unreliable (for example, duplicated activity). Exclusion never happens automatically.",
  },
];

/** A card that opens a page (web `px-card press group … p-2`): tile, name over a line, chevron; the name underlines while pressed. */
function LinkCard({ tile, title, body, onPress, testID }: { tile: ReactNode; title: string; body: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={`${title}. ${body}`} onPress={onPress}>
      {({ pressed }) => (
        <PixelFrame frame="px-card" style={[{ flexDirection: "row", alignItems: "center", gap: 16, padding: 8 }, pressStyle(pressed)]}>
          {tile}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="listName" color={ROLE.ink} style={pressed ? { textDecorationLine: "underline" } : null}>
              {title}
            </Text>
            <Text variant="meta" color={ROLE.muted}>
              {body}
            </Text>
          </View>
          <Chevron />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/** One question (web `<details>`): the question and a plus, or, open, a minus and the answer below. */
function Question({ q, a, open, onToggle, testID }: { q: string; a: string; open: boolean; onToggle: () => void; testID: string }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={q}
        onPress={onToggle}
        // the web's py-3 + py-1 around a 24px line, all on the button: a 48pt target (44 minimum)
        style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 8 }}
      >
        <Text variant="listName" color={ROLE.ink} style={{ flex: 1, minWidth: 0 }}>
          {q}
        </Text>
        <Icon name={open ? "minus" : "plus"} color={ROLE.ink} />
      </Pressable>
      {open ? (
        <Text testID={`${testID}-answer`} variant="body" color={ROLE.muted} style={{ paddingTop: 4, paddingBottom: 8 }}>
          {a}
        </Text>
      ) : null}
    </View>
  );
}

/** Help (web help/page.tsx): How Budgts works, the welcome guide replay, and the common questions, the first one open. */
export function HelpView({ onBack, go }: { onBack: () => void; go: (path: string) => void }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <View testID="help-view">
      <PageHeader title="Help" onBack={onBack} />
      <View style={{ gap: 32 }}>
        <View style={{ gap: 16 }}>
          <LinkCard
            testID="help-how-it-works"
            tile={<IconTile name="list" tone="accent" />}
            title="How Budgts works"
            body="You spend, Budgts keeps track. The whole flow on one page."
            onPress={() => go("/help/how-it-works")}
          />
          <LinkCard
            testID="help-replay-guide"
            tile={
              <PixelFrame frame="px-tile-wash" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Robin scale={1} />
              </PixelFrame>
            }
            title="Replay the welcome guide"
            body="A one-minute tour with Crystal."
            onPress={() => go("/tour")}
          />
        </View>

        <View style={{ gap: 12 }}>
          <SectionHead title="Common questions" />
          <PixelFrame testID="help-faq" frame="px-card" style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
            {FAQ.map((item, i) => (
              <View key={item.q} style={i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : undefined}>
                <Question q={item.q} a={item.a} open={open.has(i)} onToggle={() => toggle(i)} testID={`help-faq-${i}`} />
              </View>
            ))}
          </PixelFrame>
        </View>
      </View>
    </View>
  );
}
