import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BACKDROP_CELL, P } from "@/lib/brand/scene-art";
import { DriftingClouds } from "./drifting-clouds";

describe("DriftingClouds", () => {
  it("draws six of the scene's clouds, decorative only", () => {
    const { container } = render(<DriftingClouds />);
    const layer = container.firstElementChild!;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.querySelectorAll("svg")).toHaveLength(6);
  });

  it("keeps Crystal's grain: each cell is BACKDROP_CELL px, in the cloud's own three shades", () => {
    const { container } = render(<DriftingClouds />);
    const shades = new Set<string>([P.cloud.top, P.cloud.body, P.cloud.lit]);
    for (const svg of container.querySelectorAll("svg")) {
      const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number, number];
      expect(Number(svg.getAttribute("width"))).toBe(w * BACKDROP_CELL);
      expect(Number(svg.getAttribute("height"))).toBe(h * BACKDROP_CELL);
      const fills = [...svg.querySelectorAll("path")].map((p) => p.getAttribute("fill")!);
      expect(fills.length).toBeGreaterThan(0);
      for (const f of fills) expect(shades.has(f)).toBe(true);
    }
  });

  it("starts each cloud part-way across, at its own height and pace, so the sky is never empty at load", () => {
    const { container } = render(<DriftingClouds />);
    const clouds = [...container.querySelectorAll("svg")];
    const tops = clouds.map((s) => (s as SVGElement).style.top);
    expect(new Set(tops).size).toBe(clouds.length);
    for (const s of clouds) {
      const { animationDuration, animationDelay } = (s as SVGElement).style;
      const seconds = parseFloat(animationDuration), delay = parseFloat(animationDelay);
      expect(delay).toBeLessThan(0); // already under way
      expect(-delay / seconds).toBeGreaterThan(0.05);
      expect(-delay / seconds).toBeLessThan(0.9);
    }
  });
});
