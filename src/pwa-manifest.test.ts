import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = join(process.cwd(), "public");
const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8")) as {
  id?: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};

// Chrome on Android only offers "Install app" when the manifest has a 192px and a
// 512px icon; a missing 192px icon is a silent "no install option" on phones.
describe("web app manifest installability", () => {
  it("runs standalone from a stable id and start_url", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
  });

  it("has 192px and 512px icons, plus maskable variants", () => {
    const has = (size: string, purpose: string) =>
      manifest.icons.some((i) => i.sizes === size && (i.purpose ?? "any") === purpose);
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("192x192", "maskable")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("points every icon at a file that exists", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it("does not cache the manifest cache-first in the service worker", () => {
    const sw = readFileSync(join(publicDir, "sw.js"), "utf8");
    expect(sw).not.toMatch(/webmanifest/);
  });
});
