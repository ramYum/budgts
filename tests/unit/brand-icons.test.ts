import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICONS, ICON_VIEWBOX } from "@/lib/brand/icons";
import { Icon } from "@/components/icon";

/** The icon table (src/lib/brand/icons.ts) is Pixelarticons, path for path,
 * so the web and the apps draw the very same glyphs the package ships. */

const paths = (markup: string) => [...markup.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

describe("icon table", () => {
  for (const [name, glyph] of Object.entries(ICONS)) {
    if (!glyph.from) continue;
    it(`${name} is Pixelarticons' ${glyph.from}`, async () => {
      const mod = (await import(`pixelarticons/react/${glyph.from}`)) as Record<string, ComponentType>;
      const markup = renderToStaticMarkup(createElement(mod[glyph.from]!));
      expect(markup).toContain(`viewBox="${ICON_VIEWBOX}"`);
      expect(markup).toContain(`fill="currentColor"`);
      expect(glyph.d).toEqual(paths(markup));
    });
  }

  it("draws its own glyphs on the set's 2-unit grid", () => {
    for (const [name, glyph] of Object.entries(ICONS)) {
      if (glyph.from) continue;
      for (const d of glyph.d) {
        for (const n of d.match(/\d+/g)!) expect(Number(n) % 2, `${name}: ${d}`).toBe(0);
      }
    }
  });

  it("the web <Icon> renders a row as the package would", () => {
    const markup = renderToStaticMarkup(createElement(Icon, { name: "budgets", size: 36 }));
    expect(markup).toMatch(/^<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"/);
    expect(markup).toContain('shape-rendering="crispEdges"');
    expect(markup).toContain('aria-hidden="true"');
    expect(paths(markup)).toEqual(ICONS.budgets.d);
  });
});
