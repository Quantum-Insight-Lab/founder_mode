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
