/** Space kept between a form's last control and the keyboard. */
export const KEYBOARD_MARGIN = 16;

/**
 * The scroll offset that puts a form ending at `formBottom` (in the scroll
 * content's coordinates) `margin` above the keyboard, given the height of the
 * scroll view left visible above the keyboard. Zero or less means no scroll is
 * needed. Pure; the sign-in screen measures both when the keyboard appears.
 */
export function scrollTargetAboveKeyboard(formBottom: number, visibleHeight: number, margin = KEYBOARD_MARGIN): number {
  return formBottom + margin - visibleHeight;
}

/**
 * Where to scroll so a field ending at `fieldBottom` shows `margin` above the bottom of what is visible, or null when
 * it already does at the current offset `scrollY` (a browser's scroll-into-view: a field in view never moves).
 */
export function revealScrollTarget(fieldBottom: number, scrollY: number, visibleHeight: number, margin = KEYBOARD_MARGIN): number | null {
  const target = scrollTargetAboveKeyboard(fieldBottom, visibleHeight, margin);
  return target > scrollY ? target : null;
}
