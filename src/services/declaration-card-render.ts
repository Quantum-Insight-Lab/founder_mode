/**
 * Renders design/cards/declaration-card.html to PNG via headless Chromium (Playwright).
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { escapeHtml } from '../domain/html.js';
import { logger } from '../observability/logger.js';

export interface DeclarationCardPngInput {
  username: string;
  main_focus: string;
  win_result: string;
  week_failure: string;
  timeHHmm: string;
  avatarBackgroundImage: string;
}

let browserSingleton: Browser | null = null;
let embeddedRegularFontDataUrl: string | null = null;
let embeddedBoldFontDataUrl: string | null = null;
const CARD_PRESETS = [
  { name: '1080x1080', template: 'declaration-card-1080.html' },
  { name: '1080x1350', template: 'declaration-card-1350.html' },
  { name: '1080x1920', template: 'declaration-card-1920.html' },
] as const;

async function getBrowser(): Promise<Browser> {
  if (!browserSingleton) {
    browserSingleton = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserSingleton;
}

/** For tests or graceful shutdown (optional). */
export async function disposeDeclarationCardBrowser(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}

export async function buildDeclarationCardHtml(
  input: DeclarationCardPngInput,
  templateFile = 'declaration-card-1350.html'
): Promise<string> {
  const templatePath = path.join(process.cwd(), 'design/cards', templateFile);
  const template = await readFile(templatePath, 'utf8');
  const data: Record<string, string> = {
    USERNAME: input.username,
    FOCUS: input.main_focus,
    RESULT: input.win_result,
    FAILURE: input.week_failure,
    TIME: input.timeHHmm,
    AVATAR_BG_IMAGE: input.avatarBackgroundImage,
  };
  let html = template;
  for (const [key, value] of Object.entries(data)) {
    html = html.split(`{{${key}}}`).join(escapeHtml(value));
  }
  if (!embeddedRegularFontDataUrl || !embeddedBoldFontDataUrl) {
    const [regular, bold] = await Promise.all([
      readFile(path.join(process.cwd(), 'fonts', 'Roboto-Regular.ttf')),
      readFile(path.join(process.cwd(), 'fonts', 'Roboto-Bold.ttf')),
    ]);
    embeddedRegularFontDataUrl = `data:font/ttf;base64,${regular.toString('base64')}`;
    embeddedBoldFontDataUrl = `data:font/ttf;base64,${bold.toString('base64')}`;
  }
  html = html
    .split('../../fonts/Roboto-Regular.ttf')
    .join(embeddedRegularFontDataUrl)
    .split('../../fonts/Roboto-Bold.ttf')
    .join(embeddedBoldFontDataUrl);
  if (html.includes('{{')) {
    logger.warn('declaration-card template still has unreplaced placeholders');
  }
  return html;
}

async function renderAndMeasureCard(
  html: string
): Promise<{ png: Buffer; fits: boolean; metrics: Record<string, number | undefined> }> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
  try {
    const baseURL = `file://${path.join(process.cwd(), 'design/cards')}/`;
    // Playwright at runtime supports baseURL for relative resources,
    // but our TS types may not include it depending on version.
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
      // Keep generous bottom safe-area so preview clients do not visually clip text.
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

export async function renderDeclarationCardPng(input: DeclarationCardPngInput): Promise<Buffer> {
  let fallback: Buffer | null = null;
  for (const preset of CARD_PRESETS) {
    const html = await buildDeclarationCardHtml(input, preset.template);
    const rendered = await renderAndMeasureCard(html);
    if (!fallback) fallback = rendered.png;
    logger.info({ preset: preset.name, fits: rendered.fits, ...rendered.metrics }, 'Declaration card preset check');
    if (rendered.fits) return rendered.png;
  }
  return fallback ?? Buffer.alloc(0);
}
