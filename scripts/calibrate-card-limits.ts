/**
 * Calibrate max content length per card preset (Playwright + same fit rules as production).
 *
 * Usage (from repo root):
 *   npm run playwright:install   # once
 *   npm run calibrate:cards
 *   npm run calibrate:cards -- --kind=report
 *   npm run calibrate:cards -- --kind=all --mode=paragraphs
 *
 * Env:
 *   OPENAI_MODEL — for tiktoken (default gpt-4o-mini → o200k_base if model unknown)
 */
import { getEncoding, encodingForModel } from 'js-tiktoken';
import type { TiktokenModel } from 'js-tiktoken';
import { buildCardHtmlFromTemplate, measureCardLayout, closeCardRenderBrowser } from '../src/services/card-render-shared.js';
import type { CardPreset } from '../src/services/card-render-shared.js';
import { REPORT_CARD_PRESETS } from '../src/services/report-card-render.js';
import { DECLARATION_CARD_PRESETS } from '../src/services/declaration-card-render.js';
import { FIXATION_CARD_PRESETS } from '../src/services/fixation-card-render.js';

const BASE_INPUT = {
  username: 'Калибровка Имени',
  timeHHmm: '12:00',
  avatarBackgroundImage: 'none',
} as const;

type Kind = 'declaration' | 'fixation' | 'report';

function parseArgs(): { kind: Kind | 'all'; mode: 'dense' | 'paragraphs'; margin: number } {
  let kind: Kind | 'all' = 'all';
  let mode: 'dense' | 'paragraphs' = 'dense';
  let margin = 0.15;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--kind=')) {
      const v = a.split('=')[1] as Kind | 'all';
      if (v === 'declaration' || v === 'fixation' || v === 'report' || v === 'all') kind = v;
    } else if (a.startsWith('--mode=')) {
      const v = a.split('=')[1];
      if (v === 'dense' || v === 'paragraphs') mode = v;
    } else if (a.startsWith('--margin=')) {
      const n = parseFloat(a.split('=')[1]);
      if (!isNaN(n) && n >= 0 && n < 0.5) margin = n;
    }
  }
  return { kind, mode, margin };
}

function buildFiller(len: number, mode: 'dense' | 'paragraphs'): string {
  if (len <= 0) return '';
  const unit = mode === 'dense' ? 'слово ' : 'слово\n\n';
  let s = '';
  while (s.length < len) s += unit;
  return s.slice(0, len);
}

async function fits(
  template: string,
  kind: Kind,
  contentLen: number,
  mode: 'dense' | 'paragraphs'
): Promise<boolean> {
  const content = buildFiller(contentLen, mode);
  const html = await buildCardHtmlFromTemplate(template, { ...BASE_INPUT, content }, kind);
  const { fits: ok } = await measureCardLayout(html);
  return ok;
}

async function maxCharsForPreset(
  preset: CardPreset,
  kind: Kind,
  mode: 'dense' | 'paragraphs'
): Promise<number> {
  if (!(await fits(preset.template, kind, 0, mode))) return 0;

  let hi = 1;
  while (hi < 500_000 && (await fits(preset.template, kind, hi, mode))) {
    hi *= 2;
  }
  if (await fits(preset.template, kind, hi, mode)) {
    return hi;
  }

  let lo = 0;
  let hi2 = hi;
  while (lo < hi2) {
    const mid = Math.floor((lo + hi2 + 1) / 2);
    if (await fits(preset.template, kind, mid, mode)) lo = mid;
    else hi2 = mid - 1;
  }
  return lo;
}

function getTiktokenEncoder() {
  const model = (process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
  try {
    return encodingForModel(model as TiktokenModel);
  } catch {
    return getEncoding('o200k_base');
  }
}

function tokenCount(text: string): number {
  const enc = getTiktokenEncoder();
  return enc.encode(text).length;
}

const PRESETS: Record<Kind, readonly CardPreset[]> = {
  report: REPORT_CARD_PRESETS,
  declaration: DECLARATION_CARD_PRESETS,
  fixation: FIXATION_CARD_PRESETS,
};

async function main() {
  const { kind, mode, margin } = parseArgs();
  const kinds: Kind[] =
    kind === 'all' ? ['declaration', 'fixation', 'report'] : [kind];

  console.log(`mode=${mode} (dense = пробелы; paragraphs = «слово\\n\\n» — жёстче по высоте)`);
  console.log(`token margin for suggested max_completion_tokens: ${(margin * 100).toFixed(0)}%`);
  console.log('');

  const rows: string[] = [];
  for (const k of kinds) {
    for (const preset of PRESETS[k]) {
      process.stdout.write(`measuring ${k} ${preset.name} ${preset.template}... `);
      const maxChars = await maxCharsForPreset(preset, k, mode);
      const sample = buildFiller(maxChars, mode);
      const tokens = tokenCount(sample);
      const suggested = Math.max(1, Math.ceil(tokens * (1 + margin)));
      console.log(`maxChars=${maxChars}`);
      rows.push(
        `| ${k} | ${preset.name} | ${preset.template} | ${maxChars} | ${tokens} | ${suggested} |`
      );
    }
  }

  console.log('');
  console.log('| kind | preset | template | maxChars (fits) | tokens (sample) | suggested max_completion_tokens |');
  console.log('| --- | --- | --- | ---:| ---:| ---:|');
  for (const line of rows) console.log(line);

  await closeCardRenderBrowser();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
