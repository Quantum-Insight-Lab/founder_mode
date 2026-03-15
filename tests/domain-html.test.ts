import { describe, it, expect } from 'vitest';
import { escapeHtml, formatLlmResponse } from '../src/domain/html.js';

describe('domain/html', () => {
  describe('escapeHtml', () => {
    it('escapes special chars', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('>')).toBe('&gt;');
    });

    it('returns empty for empty string', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('formatLlmResponse', () => {
    it('single line: bold header only', () => {
      expect(formatLlmResponse('Header')).toBe('<b>Header</b>');
    });

    it('header + body: both escaped', () => {
      expect(formatLlmResponse('Header\nBody text')).toBe(
        '<b>Header</b>\n\nBody text'
      );
    });

    it('escapes header and body', () => {
      expect(formatLlmResponse('H & B\n<a>link</a>')).toBe(
        '<b>H &amp; B</b>\n\n&lt;a&gt;link&lt;/a&gt;'
      );
    });

    it('returns empty for empty/whitespace', () => {
      expect(formatLlmResponse('')).toBe('');
      expect(formatLlmResponse('   ')).toBe('');
    });
  });
});
