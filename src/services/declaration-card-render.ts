import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type DeclarationCardPngInput = CardHtmlInput;

export const DECLARATION_CARD_PRESETS = [
  { name: '1080x1080', template: 'declaration-card.html', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', template: 'declaration-card.html', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', template: 'declaration-card.html', designH: 1920, cardMinH: 1884 },
] as const;

export async function buildDeclarationCardHtml(
  input: DeclarationCardPngInput,
  templateFile = 'declaration-card.html',
  layout: { designH: number; cardMinH: number } = { designH: 1350, cardMinH: 1314 }
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, layout, 'declaration');
}

export async function renderDeclarationCardPng(input: DeclarationCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, DECLARATION_CARD_PRESETS, 'declaration');
}
