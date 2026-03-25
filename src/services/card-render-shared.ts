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
};

export type CardPreset = { name: string; template: string };

let browserSingleton: Browser | null = null;
let embeddedVariableFontDataUrl: string | null = null;

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

export async function buildCardHtmlFromTemplate(
  templateFile: string,
  input: CardHtmlInput,
  kind: 'declaration' | 'fixation' | 'report'
): Promise<string> {
  const templatePath = path.join(process.cwd(), 'design/cards', templateFile);
  const template = await readFile(templatePath, 'utf8');
  const data: Record<string, string> = {
    USERNAME: input.username,
    CONTENT: input.content,
    TIME: input.timeHHmm,
    AVATAR_BG_IMAGE: input.avatarBackgroundImage,
    RHYTHM: input.rhythmLine ?? '',
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
  kind: 'declaration' | 'fixation' | 'report'
): Promise<Buffer> {
  let fallback: Buffer | null = null;
  for (const preset of presets) {
    const html = await buildCardHtmlFromTemplate(preset.template, input, kind);
    const rendered = await measureCardLayout(html);
    if (!fallback) fallback = rendered.png;
    logger.info({ preset: preset.name, kind, fits: rendered.fits, ...rendered.metrics }, 'Card preset check');
    if (rendered.fits) return rendered.png;
  }
  return fallback ?? Buffer.alloc(0);
}
