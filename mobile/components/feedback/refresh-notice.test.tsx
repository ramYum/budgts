import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { RefreshNotice, StaleNotice } from "./refresh-notice";

describe("RefreshNotice (a reload failed while figures were on screen)", () => {
  it("says the figures may be out of date, with the reason and Refresh, under the id it is given", () => {
    const onRetry = vi.fn();
    const r = render(<RefreshNotice testID="goals-refresh-notice" message="Couldn't reach Budgts." onRetry={onRetry} />);
    expect(textContent(byTestId(r, "goals-refresh-notice"))).toBe("These numbers may be out of date. Couldn't reach Budgts. Refresh.");
    byTestId(r, "goals-refresh-notice-retry").props.onPress();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers Refresh as the card's one action to a screen reader", () => {
    const onRetry = vi.fn();
    const r = render(<RefreshNotice testID="home-refresh-notice" message="Couldn't reach Budgts." onRetry={onRetry} />);
    const card = byTestId(r, "home-refresh-notice");
    expect(card.props.accessibilityLabel).toBe("These numbers may be out of date. Couldn't reach Budgts.");
    card.props.onAccessibilityAction({ nativeEvent: { actionName: "activate" } });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("the shell's slot draws it only while there is a notice, as <screen>-refresh-notice", () => {
    expect(render(<StaleNotice name="home" notice={null} onRetry={() => {}} />).toJSON()).toBeNull();
    expect(render(<StaleNotice />).toJSON()).toBeNull();
    const r = render(<StaleNotice name="home" notice="Couldn't reach Budgts." onRetry={() => {}} />);
    expect(byTestId(r, "home-refresh-notice")).toBeTruthy();
  });
});

describe("StandaloneShell draws the notice as <Screen> does (Delete account)", () => {
  it("first in the column, with the screen's ids", async () => {
    const { StandaloneShell } = await import("../settings/standalone-shell");
    const onRetry = vi.fn();
    const r = render(
      <StandaloneShell align="top" name="delete-account" notice="Couldn't reach Budgts." onRetry={onRetry}>
        <></>
      </StandaloneShell>,
    );
    const content = byTestId(r, "screen-content");
    expect(content.findAll((n) => typeof n.type === "string" && n.props.testID === "delete-account-refresh-notice")).toHaveLength(1);
    byTestId(r, "delete-account-refresh-notice-retry").props.onPress();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
