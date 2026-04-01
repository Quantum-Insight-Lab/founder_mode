/**
 * Shared Playwright PNG rendering for design/cards/*.html templates.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { escapeHtml } from '../domain/html.js';
import { logger } from '../observability/logger.js';

export type CardHtmlInput = {
  username: string;
  content: string;
  timeHHmm: string;
  avatarBackgroundImage: string;
  /** «Ритм N» или пусто — скрывает левую часть подвала */
  rhythmLine?: string;
  /** Optional badge image (data URL). If not provided, default badge is used. */
  badgeImage?: string;
};

export type CardPreset = {
  name: string;
  template: string;
  /** Height of the design board in px (e.g. 1080/1350/1920). */
  designH: number;
  /** Card min-height in px (usually designH - board padding*2). */
  cardMinH: number;
};

/** Smaller scales tried on the tallest preset when default typography overflows. */
export const CARD_LAST_PRESET_TYPE_SCALE_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58] as const;

const ALLOWED_TYPE_SCALES = new Set<number>([1, ...CARD_LAST_PRESET_TYPE_SCALE_STEPS]);

function typeScaleToken(layout: { typeScale?: number }): string {
  const t = layout.typeScale ?? 1;
  return ALLOWED_TYPE_SCALES.has(t) ? String(t) : '1';
}

export type CardLayoutOptions = {
  designH: number;
  cardMinH: number;
  /** Typography scale (1 = design defaults). Only allowlisted values are substituted. */
  typeScale?: number;
};

let browserSingleton: Browser | null = null;
let embeddedVariableFontDataUrl: string | null = null;
let embeddedDefaultBadgeDataUrl: string | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserSingleton) {
    browserSingleton = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserSingleton;
}

/** Close Playwright browser (e.g. after calibration script). */
export async function closeCardRenderBrowser(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}

async function ensureEmbeddedRobotoFont(): Promise<string> {
  if (!embeddedVariableFontDataUrl) {
    const variable = await readFile(path.join(process.cwd(), 'fonts', 'Roboto-Variable.ttf'));
    embeddedVariableFontDataUrl = `data:font/ttf;base64,${variable.toString('base64')}`;
  }
  return embeddedVariableFontDataUrl;
}

async function ensureEmbeddedDefaultBadge(): Promise<string | null> {
  if (embeddedDefaultBadgeDataUrl !== null) return embeddedDefaultBadgeDataUrl;
  {
    const tryRead = async (filename: string): Promise<Buffer | null> => {
      try {
        return await readFile(path.join(process.cwd(), 'design', 'assets', filename));
      } catch {
        return null;
      }
    };
    // Prefer webp, fall back to png for local/dev convenience.
    const webp = await tryRead('default_badge.webp');
    const png = webp ? null : await tryRead('default_badge.png');
    const buf = webp ?? png;
    if (!buf) return null;
    const mime = webp ? 'image/webp' : 'image/png';
    embeddedDefaultBadgeDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  }
  return embeddedDefaultBadgeDataUrl;
}

export async function buildCardHtmlFromTemplate(
  templateFile: string,
  input: CardHtmlInput,
  layout: CardLayoutOptions,
  kind: 'declaration' | 'fixation' | 'report' | 'change'
): Promise<string> {
  const templatePath = path.join(process.cwd(), 'design/cards', templateFile);
  const template = await readFile(templatePath, 'utf8');
  const badgeImage = input.badgeImage ?? (await ensureEmbeddedDefaultBadge()) ?? '';
  const data: Record<string, string> = {
    USERNAME: input.username,
    CONTENT: input.content,
    TIME: input.timeHHmm,
    AVATAR_BG_IMAGE: input.avatarBackgroundImage,
    RHYTHM: input.rhythmLine ?? '',
    BADGE_IMAGE: badgeImage,
    BADGE_DISPLAY: badgeImage ? 'block' : 'none',
    DESIGN_H: String(layout.designH),
    CARD_MIN_H: String(layout.cardMinH),
    TYPE_SCALE: typeScaleToken(layout),
  };
  let html = template;
  for (const [key, value] of Object.entries(data)) {
    html = html.split(`{{${key}}}`).join(escapeHtml(value));
  }
  const fontUrl = await ensureEmbeddedRobotoFont();
  html = html.split('../../fonts/Roboto-Variable.ttf').join(fontUrl);
  if (html.includes('{{')) {
    logger.warn({ kind }, 'card template still has unreplaced placeholders');
  }
  return html;
}

/** Measure layout fit (same rules as PNG pipeline). For calibration scripts. */
export async function measureCardLayout(
  html: string
): Promise<{ png: Buffer; fits: boolean; metrics: Record<string, number | undefined> }> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
  try {
    const baseURL = `file://${path.join(process.cwd(), 'design/cards')}/`;
    await page.setContent(html, { waitUntil: 'load', baseURL } as any);
    const measured = await page.evaluate(() => {
      const card = document.querySelector('.card') as HTMLElement | null;
      const lastField = document.querySelector('.content .field:last-of-type') as HTMLElement | null;
      const time = document.querySelector('.time') as HTMLElement | null;
      if (!card || !lastField || !time) {
        return { fits: false, metrics: { hasElements: 0 } };
      }
      const cardRect = card.getBoundingClientRect();
      const lastRect = lastField.getBoundingClientRect();
      const timeRect = time.getBoundingClientRect();
      const SAFE_GAP_TO_TIME = 44;
      const SAFE_GAP_TO_CARD_BOTTOM = 52;
      const fitsByVertical = lastRect.bottom <= timeRect.top - SAFE_GAP_TO_TIME;
      const fitsByCardBottom = lastRect.bottom <= cardRect.bottom - SAFE_GAP_TO_CARD_BOTTOM;
      const fitsByScroll = card.scrollHeight <= card.clientHeight;
      const fits = fitsByVertical && fitsByCardBottom && fitsByScroll;
      return {
        fits,
        metrics: {
          hasElements: 1,
          lastFieldBottom: Math.round(lastRect.bottom),
          timeTop: Math.round(timeRect.top),
          cardBottom: Math.round(cardRect.bottom),
          gapToTime: Math.round(timeRect.top - lastRect.bottom),
          gapToBottom: Math.round(cardRect.bottom - lastRect.bottom),
          cardScrollHeight: card.scrollHeight,
          cardClientHeight: card.clientHeight,
        },
      };
    });
    const board = page.locator('.board');
    await board.waitFor({ state: 'visible' });
    const buf = await board.screenshot({ type: 'png' });
    return { png: Buffer.from(buf), fits: measured.fits, metrics: measured.metrics };
  } finally {
    await page.close();
  }
}

export async function renderCardPngWithPresets(
  input: CardHtmlInput,
  presets: readonly CardPreset[],
  kind: 'declaration' | 'fixation' | 'report' | 'change'
): Promise<Buffer> {
  let fallback: Buffer | null = null;
  const lastPreset = presets.length > 0 ? presets[presets.length - 1] : null;

  for (const preset of presets) {
    const isLastPreset = lastPreset !== null && preset === lastPreset;
    const baseLayout = { designH: preset.designH, cardMinH: preset.cardMinH };

    const measureAtScale = async (typeScale: number) => {
      const html = await buildCardHtmlFromTemplate(preset.template, input, { ...baseLayout, typeScale }, kind);
      return measureCardLayout(html);
    };

    let rendered = await measureAtScale(1);
    if (!fallback) fallback = rendered.png;
    logger.info(
      { preset: preset.name, kind, typeScale: 1, fits: rendered.fits, ...rendered.metrics },
      'Card preset check'
    );
    if (rendered.fits) return rendered.png;

    if (isLastPreset) {
      let lastPng = rendered.png;
      for (const typeScale of CARD_LAST_PRESET_TYPE_SCALE_STEPS) {
        rendered = await measureAtScale(typeScale);
        lastPng = rendered.png;
        logger.info(
          { preset: preset.name, kind, typeScale, fits: rendered.fits, ...rendered.metrics },
          'Card preset check'
        );
        if (rendered.fits) return rendered.png;
      }
      return lastPng;
    }
  }

  return fallback ?? Buffer.alloc(0);
}
