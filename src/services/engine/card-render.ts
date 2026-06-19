import type { CardHtmlInput } from '../card-render-shared.js';
import { renderCardPngWithPresets } from '../card-render-shared.js';

const ENGINE_CARD_PRESETS = [
  { name: '1080x1080', template: 'fixation-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'fixation-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'fixation-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function renderEngineCardPng(input: CardHtmlInput, _kind: string): Promise<Buffer> {
  return renderCardPngWithPresets(input, ENGINE_CARD_PRESETS, 'fixation');
}
