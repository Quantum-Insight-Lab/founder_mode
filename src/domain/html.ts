/**
 * HTML escaping and LLM response formatting for Telegram parse_mode: HTML
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format LLM response: header bold, body escaped. For plan/reflect/review. */
export function formatLlmResponse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const newlineIdx = trimmed.indexOf('\n');
  const header = newlineIdx >= 0 ? trimmed.slice(0, newlineIdx).trim() : trimmed;
  const body = newlineIdx >= 0 ? trimmed.slice(newlineIdx + 1).trimStart() : '';
  return '<b>' + escapeHtml(header) + '</b>' + (body ? '\n\n' + escapeHtml(body) : '');
}
