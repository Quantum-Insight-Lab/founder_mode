import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type ChangeCardPngInput = CardHtmlInput;

export const CHANGE_CARD_PRESETS = [
  { name: '1080x1080', template: 'change-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'change-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'change-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function buildChangeCardHtml(
  input: ChangeCardPngInput,
  templateFile = 'change-card.html',
  layout: { designH: number; cardMinH: number } = { designH: 1350, cardMinH: 1314 }
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, layout, 'change');
}

export async function renderChangeCardPng(input: ChangeCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, CHANGE_CARD_PRESETS, 'change');
}
