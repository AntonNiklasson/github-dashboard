// Provider text is untrusted, including ANSI escape sequences and newlines:
// replace control characters before writing it to a terminal.
export function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- prevent terminal control sequences in provider content
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
