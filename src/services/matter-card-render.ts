import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type MatterCardPngInput = CardHtmlInput;

export const MATTER_CARD_PRESETS = [
  { name: '1080x1080', template: 'declaration-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'declaration-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'declaration-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function renderMatterCardPng(input: MatterCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, MATTER_CARD_PRESETS, 'matter');
}

export async function buildMatterCardHtml(input: MatterCardPngInput): Promise<string> {
  return buildCardHtmlFromTemplate('declaration-card.html', input, { designH: 1350, cardMinH: 1314 }, 'matter');
}
