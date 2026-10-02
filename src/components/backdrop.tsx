"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { BACKDROP_CELL, BACKDROP_LAND_GAP, BACKDROP_SKY, backdropSize, drawBackdrop, sceneRgba } from "@/lib/brand/scene-art";

/** The sky's bands span the box above the lake: BACKDROP_LAND_GAP above the
 * bar, then the lake's 10 rows of 2 px (scene-art.ts drawBackdrop). */
const SKY_INSET = BACKDROP_LAND_GAP + 20;

/** Until the canvas paints (before hydration), the box shows the sky's ten
 * bands as hard-stop CSS, so a cold load opens on the sky, not on gray. */
const FIRST_PAINT: CSSProperties = {
  backgroundColor: BACKDROP_SKY[BACKDROP_SKY.length - 1],
  backgroundImage: `linear-gradient(to bottom, ${BACKDROP_SKY.map((c, i) => `${c} ${i * 10}% ${(i + 1) * 10}%`).join(", ")})`,
  backgroundSize: `100% calc(100% - var(--backdrop-bar) - ${SKY_INSET}px)`,
  backgroundRepeat: "no-repeat",
};

/**
 * Crystal's sunset forest (option B, "Full backdrop", owner-approved
 * 2026-10-02). src/lib/brand/scene-art.ts draws the scene cell for cell at
 * this box's size, one canvas pixel a cell, shown at 2 CSS px a cell
 * (Crystal's grain) with nearest-neighbour scaling. It redraws only when the
 * box or the tab bar changes size (a ResizeObserver, no polling).
 *
 * `shell` (the app's dashboard): the box is fixed to the bottom of the screen
 * and as tall as the large viewport, so a phone browser's toolbar showing or
 * hiding never moves or redraws it; the meadow and the edge pines sit just
 * above the tab bar, whose real height (safe area included) is measured, and
 * on desktop the scene starts right of the sidebar.
 *
 * Otherwise (the company homepage, a long page with no tab bar): the box
 * covers its positioned parent, the whole page, so the sky's bands run down
 * the page as it scrolls and the lake, meadow and pines are its last screen,
 * never under the text above it.
 *
 * `clouds={false}` leaves out the scene's painted clouds, where a page drifts
 * its own over the sky (the homepage's <DriftingClouds>): a still cloud beside
 * moving ones reads as stuck.
 */
export function Backdrop({ shell = false, clouds = true }: { shell?: boolean; clouds?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const bar = shell ? document.querySelector<HTMLElement>('[data-testid="bottom-nav"]') : null;
    let drawn = "";
    const paint = () => {
      const inset = bar ? bar.getBoundingClientRect().height : 0; // 0 while the bar is hidden (desktop)
      const { cols, rows, land } = backdropSize(el.clientWidth, el.clientHeight, inset);
      const key = `${cols}x${rows}@${land}`;
      if (key === drawn || cols <= 0 || rows <= 0) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      drawn = key;
      cv.width = cols;
      cv.height = rows;
      cv.style.width = `${cols * BACKDROP_CELL}px`;
      cv.style.height = `${rows * BACKDROP_CELL}px`;
      const image = ctx.createImageData(cols, rows);
      image.data.set(sceneRgba(drawBackdrop(cols, rows, land, { clouds })));
      ctx.putImageData(image, 0, 0);
    };
    paint();
    const resize = new ResizeObserver(paint);
    resize.observe(el);
    if (bar) resize.observe(bar);
    return () => resize.disconnect();
  }, [shell, clouds]);

  return (
    <div
      ref={box}
      aria-hidden
      data-testid="backdrop"
      className={`pointer-events-none -z-10 overflow-hidden ${
        shell
          ? "fixed inset-x-0 bottom-0 h-lvh [--backdrop-bar:72px] md:left-[248px] md:[--backdrop-bar:0px]"
          : "absolute inset-0 [--backdrop-bar:0px]"
      }`}
      style={FIRST_PAINT}
    >
      {/* anchored bottom-left: a box an odd px wide or tall loses at most 1 px of sky or pine, never the grain */}
      <canvas ref={canvas} className="absolute bottom-0 left-0 [image-rendering:pixelated]" />
    </div>
  );
}
