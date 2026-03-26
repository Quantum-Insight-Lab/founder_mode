import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type ReportCardPngInput = CardHtmlInput;

export const REPORT_CARD_PRESETS = [
  { name: '1080x1080', template: 'report-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'report-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'report-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function buildReportCardHtml(
  input: ReportCardPngInput,
  templateFile = 'report-card.html',
  layout: { designH: number; cardMinH: number } = { designH: 1350, cardMinH: 1314 }
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, layout, 'report');
}

export async function renderReportCardPng(input: ReportCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, REPORT_CARD_PRESETS, 'report');
}
