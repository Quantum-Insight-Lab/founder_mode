import type { CardHtmlInput } from './card-render-shared.js';
import { buildCardHtmlFromTemplate, renderCardPngWithPresets } from './card-render-shared.js';

export type DeclarationCardPngInput = CardHtmlInput;

export const DECLARATION_CARD_PRESETS = [
  { name: '1080x1080', template: 'declaration-card-1080.html' },
  { name: '1080x1350', template: 'declaration-card-1350.html' },
  { name: '1080x1920', template: 'declaration-card-1920.html' },
] as const;

export async function buildDeclarationCardHtml(
  input: DeclarationCardPngInput,
  templateFile = 'declaration-card-1350.html'
): Promise<string> {
  return buildCardHtmlFromTemplate(templateFile, input, 'declaration');
}

export async function renderDeclarationCardPng(input: DeclarationCardPngInput): Promise<Buffer> {
  return renderCardPngWithPresets(input, DECLARATION_CARD_PRESETS, 'declaration');
}
