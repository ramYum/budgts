import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ui";

const bar = (ui: React.ReactElement) => {
  const { container } = render(ui);
  const root = container.firstElementChild as HTMLElement;
  const v = (name: string) => root.style.getPropertyValue(name);
  return { root, v };
};

describe("ProgressBar", () => {
  it("paints one strip of square cells, hidden from assistive tech", () => {
    const { root } = bar(<ProgressBar pct={62} />);
    expect(root).toHaveClass("px-cells");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.children).toHaveLength(1);
    expect(root.firstElementChild).toHaveClass("px-bar");
  });

  it("hands the stylesheet the share to light, and lights a cell as soon as anything counts", () => {
    expect(bar(<ProgressBar pct={62} />).v("--share")).toBe("0.62");
    expect(bar(<ProgressBar pct={62} />).v("--min-lit")).toBe("1");
    expect(bar(<ProgressBar pct={0.4} />).v("--min-lit")).toBe("1");
    const empty = bar(<ProgressBar pct={0} />);
    expect(empty.v("--share")).toBe("0");
    expect(empty.v("--min-lit")).toBe("0");
  });

  it("clamps the share to the bar", () => {
    expect(bar(<ProgressBar pct={140} tone="near" />).v("--share")).toBe("1");
    expect(bar(<ProgressBar pct={-20} />).v("--share")).toBe("0");
  });

  it("fills every cell and flashes when over, whatever the figure", () => {
    const over = bar(<ProgressBar pct={40} tone="over" />);
    expect(over.root).toHaveClass("cells-over");
    expect(over.v("--share")).toBe("1");
    expect(over.v("--min-lit")).toBe("1");
    expect(bar(<ProgressBar pct={40} tone="near" />).root).not.toHaveClass("cells-over");
  });

  it("colors the lit cells by tone: ink on track, the accent near or over, green toward a goal", () => {
    expect(bar(<ProgressBar pct={50} />).v("--fill")).toBe("var(--fill-under)");
    expect(bar(<ProgressBar pct={50} tone="near" />).v("--fill")).toBe("var(--fill-over)");
    expect(bar(<ProgressBar pct={50} tone="over" />).v("--fill")).toBe("var(--fill-over)");
    expect(bar(<ProgressBar pct={50} tone="growth" />).v("--fill")).toBe("var(--pos)");
  });

  it("sizes cells to the bar's thickness and staggers its entrance by `start`", () => {
    const hero = bar(<ProgressBar pct={50} cellHeight={12} start={6} />);
    expect(hero.v("--cell-h")).toBe("12px");
    expect(hero.v("--start")).toBe("6");
    expect(bar(<ProgressBar pct={50} />).v("--cell-h")).toBe("");
  });

  it("fits a fixed count of cells exactly when given one (a step tracker)", () => {
    const steps = bar(<ProgressBar pct={(2 / 3) * 100} cells={3} />);
    expect(steps.root.style.width).toBe("calc(3 * var(--cell-h) + 2 * var(--gap))");
    expect(bar(<ProgressBar pct={50} />).root.style.width).toBe("");
  });
});
