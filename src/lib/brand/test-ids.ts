/**
 * Test ids shared by the web (`data-testid`) and the native app (`testID`): the parity check (tools/parity/screens.ts)
 * matches elements across the two by these strings. Pure, so both sides import the one derivation.
 */

/** A hub row's id from where it goes: `/settings/profile` → `hub-settings-profile`, `/` → `hub-home`. */
export function hubTestId(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  return `hub-${path || "home"}`;
}

/** A bottom tab's id from its label: `Home` → `tab-home`. */
export function tabTestId(label: string): string {
  return `tab-${label.toLowerCase()}`;
}
