import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type FixationCardPngInput = CardHtmlInput;

export const FIXATION_CARD_PRESETS = [
  { name: '1080x1080', template: 'fixation-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'fixation-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'fixation-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function buildFixationCardHtml(
  input: FixationCardPngInput,
  templateFile = 'fixation-card.html',
  layout: { designH: number; cardMinH: number } = { designH: 1350, cardMinH: 1314 }
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, layout, 'fixation');
}

export async function renderFixationCardPng(input: FixationCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, FIXATION_CARD_PRESETS, 'fixation');
}
