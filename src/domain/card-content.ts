/** Убирает дубли заголовка карточки в начале текста от LLM (заголовок уже в HTML-шаблоне). */
export function stripLeadingCardHeadings(content: string, headings: string[]): string {
  let text = content.trim();
  for (const heading of headings) {
    const h = heading.trim();
    if (!h) continue;
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escaped}\\s*[:—\\-–]?\\s*`, 'iu'), '');
    text = text.replace(new RegExp(`^${escaped}\\s*\\n+`, 'iu'), '');
  }
  return text.trim();
}
