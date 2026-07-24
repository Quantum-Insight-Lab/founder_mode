import type { CardHtmlInput, CardPreset } from '../card-render-shared.js';
import { renderCardPngWithPresets } from '../card-render-shared.js';
import { stripLeadingCardHeadings } from '../../domain/card-content.js';

const SIZES = [
  { name: '1080x1080', designH: 1080, cardMinH: 1044 },
  { name: '1080x1350', designH: 1350, cardMinH: 1314 },
  { name: '1080x1920', designH: 1920, cardMinH: 1884 },
] as const;

function presetsFor(template: string): CardPreset[] {
  return SIZES.map((s) => ({ ...s, template }));
}

const ENGINE_CARD_BY_KIND = {
  engine_focus: { presets: presetsFor('declaration-card.html'), renderKind: 'declaration' as const },
  engine_log: { presets: presetsFor('fixation-card.html'), renderKind: 'fixation' as const },
  engine_recap: { presets: presetsFor('report-card.html'), renderKind: 'report' as const },
  engine_pivot: { presets: presetsFor('change-card.html'), renderKind: 'change' as const },
} as const;

/** Заголовки, уже захардкоженные в design/cards/*.html */
const TEMPLATE_HEADINGS: Record<keyof typeof ENGINE_CARD_BY_KIND, string[]> = {
  engine_focus: ['Приоритет недели'],
  engine_log: ['Фиксация дня'],
  engine_recap: ['Недельный срез'],
  engine_pivot: ['Смена приоритета'],
};

export type EngineCardKind = keyof typeof ENGINE_CARD_BY_KIND;

export async function renderEngineCardPng(
  input: CardHtmlInput,
  kind: EngineCardKind,
  extraHeadings: string[] = []
): Promise<Buffer> {
  const { presets, renderKind } = ENGINE_CARD_BY_KIND[kind];
  const headings = [...TEMPLATE_HEADINGS[kind], ...extraHeadings];
  const content = stripLeadingCardHeadings(input.content, headings);
  return renderCardPngWithPresets({ ...input, content }, presets, renderKind);
}
