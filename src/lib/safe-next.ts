/** Keep authentication return destinations on this origin, including after URL normalization. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(next)) return "/";
  return next;
}
