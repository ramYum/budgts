import { createContext, useContext } from "react";
import { BACKDROP_MUTED } from "../../lib/brand/backdrop";
import { ROLE } from "../../lib/brand/shared";

/**
 * Whether what draws here sits straight on the sunset backdrop (components/shell/backdrop.tsx): the web's
 * `.on-backdrop`, which sets `--muted` to BACKDROP_MUTED (the gray is under 4.5:1 on the upper sky bands), with every
 * surface taking the gray back. <Screen> sets it for its page; every <PixelFrame> (cards, sheets, fields, buttons:
 * each frame paints its own fill) clears it for what it holds.
 */
export const OnBackdrop = createContext(false);

/** The colour a text or icon draws in: the muted role resolves to BACKDROP_MUTED on the backdrop, as `--muted` does. */
export function useRoleColor(color: string): string {
  const onBackdrop = useContext(OnBackdrop);
  return onBackdrop && color === ROLE.muted ? BACKDROP_MUTED : color;
}
