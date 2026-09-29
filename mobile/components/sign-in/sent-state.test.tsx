import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SentState } from "./sent-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resend = (r: ReactTestRenderer) => r.root.find((n) => n.props.testID === "sign-in-resend" && typeof n.props.onPress === "function");

function render(props: { waitSeconds: number; waitKey: number }) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<SentState email="me@example.com" onResend={() => {}} resending={false} error={null} onUseDifferentEmail={() => {}} {...props} />);
  });
  return r;
}

describe("<SentState> resend countdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down the server's wait, not a fixed 60s, then offers the resend", () => {
    const r = render({ waitSeconds: 42, waitKey: 1 });
    expect(resend(r).props.children).toBe("Send it again in 42s");
    expect(resend(r).props.disabled).toBe(true);
    for (let i = 0; i < 42; i++) act(() => void vi.advanceTimersByTime(1000));
    expect(resend(r).props.children).toBe("Send it again");
    expect(resend(r).props.disabled).toBe(false);
  });

  it("restarts with the new wait after another attempt", () => {
    const r = render({ waitSeconds: 60, waitKey: 1 });
    act(() => void vi.advanceTimersByTime(5000));
    act(() => r.update(<SentState email="me@example.com" onResend={() => {}} resending={false} error={null} onUseDifferentEmail={() => {}} waitSeconds={17} waitKey={2} />));
    expect(resend(r).props.children).toBe("Send it again in 17s");
  });

  it("offers the resend at once when there is nothing to wait for", () => {
    expect(resend(render({ waitSeconds: 0, waitKey: 1 })).props.disabled).toBe(false);
  });
});
