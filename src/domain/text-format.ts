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
 * If the text has at least one line break, turn each `\n` into a paragraph gap (`\n\n`).
 * Runs of 3+ newlines collapse to `\n\n` so existing blank lines are not inflated.
 */
export function ensureDoubleNewlinesIfMultiline(text: string): string {
  if (!text.includes('\n')) return text;
  return text.replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n');
}
