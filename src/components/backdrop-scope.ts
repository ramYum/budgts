import type { CSSProperties } from "react";
import { BACKDROP_MUTED } from "@/lib/brand/scene-art";

/**
 * Wrap content that sits on the sunset backdrop (components/backdrop.tsx) in
 * this class and style: secondary text straight on the sky takes the deeper
 * BACKDROP_MUTED (4.5:1 on every band), and every surface inside takes the gray
 * muted back (globals.css `.on-backdrop`). Used by the app's shell and the
 * company homepage.
 */
export const ON_BACKDROP: { className: string; style: CSSProperties } = {
  className: "on-backdrop",
  style: { "--muted": BACKDROP_MUTED } as CSSProperties,
};
