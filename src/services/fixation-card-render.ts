import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type FixationCardPngInput = CardHtmlInput;

export const FIXATION_CARD_PRESETS = [
  { name: '1080x1080', template: 'fixation-card-1080.html' },
  { name: '1080x1350', template: 'fixation-card-1350.html' },
  { name: '1080x1920', template: 'fixation-card-1920.html' },
] as const;

export async function buildFixationCardHtml(
  input: FixationCardPngInput,
  templateFile = 'fixation-card-1350.html'
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, 'fixation');
}

export async function renderFixationCardPng(input: FixationCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, FIXATION_CARD_PRESETS, 'fixation');
}
