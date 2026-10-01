import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { useScrollWatchSource } from "./scroll-context";

describe("ScrollWatch.scrollTo (a web #anchor link: Activity's focus=needs-category)", () => {
  it("scrolls the screen's ScrollView to a content offset, never above the top", () => {
    let source!: ReturnType<typeof useScrollWatchSource>;
    function Probe() {
      source = useScrollWatchSource();
      return null;
    }
    render(<Probe />);
    const scrollTo = vi.fn();
    source.scrollRef.current = { scrollTo } as never;
    source.watch.scrollTo!(616, true);
    source.watch.scrollTo!(-24, false);
    expect(scrollTo.mock.calls).toEqual([[{ y: 616, animated: true }], [{ y: 0, animated: false }]]);
  });

  it("does nothing before the ScrollView mounts", () => {
    let source!: ReturnType<typeof useScrollWatchSource>;
    function Probe() {
      source = useScrollWatchSource();
      return null;
    }
    render(<Probe />);
    expect(() => source.watch.scrollTo!(100, true)).not.toThrow();
  });
});
