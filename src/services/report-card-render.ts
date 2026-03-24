import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type ReportCardPngInput = CardHtmlInput;

export const REPORT_CARD_PRESETS = [
  { name: '1080x1080', template: 'report-card-1080.html' },
  { name: '1080x1350', template: 'report-card-1350.html' },
  { name: '1080x1920', template: 'report-card-1920.html' },
] as const;

export async function buildReportCardHtml(
  input: ReportCardPngInput,
  templateFile = 'report-card-1350.html'
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, 'report');
}

export async function renderReportCardPng(input: ReportCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, REPORT_CARD_PRESETS, 'report');
}
