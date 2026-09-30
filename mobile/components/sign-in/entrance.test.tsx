import { afterEach, describe, expect, it } from "vitest";
import { View } from "react-native";
import { PAGE_ENTER, RISE_IN } from "../../lib/motion/css";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render } from "../../test/render";
import { SignInEntrance } from "./entrance";

afterEach(() => {
  reducedMotion.value = false;
});

const view = () =>
  render(
    <SignInEntrance stage={<View testID="stage" />} legal={<View testID="legal" />}>
      <View testID="card" />
    </SignInEntrance>,
  );

/** The animated view directly around a part. */
const around = (r: ReturnType<typeof render>, id: string) =>
  flat(hosts(r, "Animated.View").find((v) => v.findAll((n) => n.props.testID === id && typeof n.type === "string").length > 0 && !hosts(v, "Animated.View").slice(1).some((inner) => inner.findAll((n) => n.props.testID === id).length > 0))!.props.style);

describe("the sign-in entrance (web (auth)/layout.tsx: page-enter, then .reveal --i 2 and 3)", () => {
  it("the brand stage arrives with the page: page-enter, 420ms, rising 6px", () => {
    expect(around(view(), "stage")).toMatchObject({ animationName: PAGE_ENTER, animationDuration: "420ms", animationDelay: "0ms", animationFillMode: "backwards" });
  });

  it("then the card rises in at --i 2 and the legal line at --i 3 (i × 70 + 40ms, 560ms)", () => {
    const r = view();
    expect(around(r, "card")).toMatchObject({ animationName: RISE_IN, animationDuration: "560ms", animationDelay: "180ms" });
    expect(around(r, "legal")).toMatchObject({ animationName: RISE_IN, animationDuration: "560ms", animationDelay: "250ms" });
  });

  it("keeps the stage's 32px gap under it and shows no legal line when there is none", () => {
    const r = render(
      <SignInEntrance stage={<View testID="stage" />}>
        <View testID="card" />
      </SignInEntrance>,
    );
    expect(around(r, "stage").marginBottom).toBe(32);
    expect(() => byTestId(r, "legal")).toThrow();
  });

  it("is the final frame under Reduce Motion", () => {
    reducedMotion.value = true;
    const r = view();
    expect(hosts(r, "Animated.View").map((v) => flat(v.props.style)).filter((s) => s.animationName)).toEqual([]);
    for (const id of ["stage", "card", "legal"]) expect(byTestId(r, id)).toBeTruthy();
  });
});
