/**
 * Only a same-origin absolute path is a safe redirect target. Rejects
 * `//host`, `/\host`, protocol URLs, and anything not starting with one `/`.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || value[0] !== "/") return "/";
  if (value[1] === "/" || value[1] === "\\") return "/";
  return value;
}
