export function stripTrailingDotsPerLine(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return '';
      return trimmed.replace(/\.+$/u, '');
    })
    .join('\n');
}

/**
 * Normalize typography: if a line contains `...: X...` (a letter after a colon),
 * make that first letter lowercase: `...: x...`.
 *
 * Runs per-line to avoid changing later sentences within the same line.
 */
export function lowercaseFirstLetterAfterColonPerLine(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      // Only transform patterns with a single space after colon:
      // "Label: Text" -> "Label: text"
      const m = line.match(/^([^:]+:)(\s+)([A-ZА-ЯЁ])([\s\S]*)$/u);
      if (!m) return line;
      const [, prefix, ws, first, rest] = m;
      return prefix + ws + first.toLowerCase() + rest;
    })
    .join('\n');
}

/**
 * If the text has at least one line break, turn each `\n` into a paragraph gap (`\n\n`).
 * Runs of 3+ newlines collapse to `\n\n` so existing blank lines are not inflated.
 */
export function ensureDoubleNewlinesIfMultiline(text: string): string {
  if (!text.includes('\n')) return text;
  return text.replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n');
}
