import type { ReactElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

/**
 * Rendering helpers for component tests over the host stand-ins
 * (native-hosts.ts): render inside act(), find hosts by type or testID, and
 * flatten a style array the way React Native does.
 */

// React 19's act() environment flag for a non-DOM renderer
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function render(node: ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(node);
  });
  return r;
}

export const isHost = (n: ReactTestInstance, type: string) => (n.type as unknown) === type;
export const hosts = (r: ReactTestRenderer | ReactTestInstance, type: string) =>
  ("root" in r ? r.root : r).findAll((n) => isHost(n, type));

/** The host element carrying `testID` (composite wrappers pass the prop down; the host is what the device sees). */
export function byTestId(r: ReactTestRenderer, testID: string): ReactTestInstance {
  const found = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === testID);
  if (found.length !== 1) throw new Error(`expected one host with testID "${testID}", found ${found.length}`);
  return found[0]!;
}

export const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

/** Every string rendered under a node, in order. */
export function texts(n: ReactTestRenderer | ReactTestInstance): string[] {
  return hosts(n, "Text").flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]).filter((c: unknown) => typeof c === "string"));
}

/** The text a node reads as, in order: nested Text runs joined the way the device lays them out inline. */
export function textContent(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === "string" ? c : textContent(c))).join("");
}
