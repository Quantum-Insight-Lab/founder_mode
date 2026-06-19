import type { CardHtmlInput } from './card-render-shared.js';
import { renderCardPngWithPresets } from './card-render-shared.js';

export type DigestCardPngInput = CardHtmlInput;

const DIGEST_CARD_PRESETS = [
  { name: '1080x1080', template: 'report-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'report-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'report-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function renderDigestCardPng(input: DigestCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, DIGEST_CARD_PRESETS, 'digest');
}
