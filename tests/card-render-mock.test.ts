/**
 * Engine card PNG pipeline with mocked Playwright — no Chromium, runs in default npm test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createMockPage(options: { fits: boolean }) {
  return {
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({
      fits: options.fits,
      metrics: {
        hasElements: 1,
        lastFieldBottom: 100,
        timeTop: 300,
        gapToTime: 80,
      },
    }),
    locator: vi.fn().mockReturnValue({
      waitFor: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.concat([pngHeader, Buffer.from([0, 1, 2])])),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

const launchMock = vi.fn();

vi.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => launchMock(...args),
  },
}));

async function loadRenderEngine() {
  const mod = await import('../src/services/engine/card-render.js');
  return mod.renderEngineCardPng;
}

describe('engine card PNG render (mocked Playwright)', () => {
  beforeEach(async () => {
    vi.resetModules();
    launchMock.mockReset();
  });

  it('returns PNG from first preset when fits is true', async () => {
    launchMock.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(createMockPage({ fits: true })),
    });

    const renderEngineCardPng = await loadRenderEngine();
    const buf = await renderEngineCardPng({
      username: 'Test',
      content: 'Фокус: A\n\nРезультат: B\n\nПровал: C',
      timeHHmm: '12:00',
      avatarBackgroundImage: 'none',
    }, 'engine_focus');

    expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
    expect(buf.length).toBeGreaterThan(8);
    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it('tries next preset until one fits', async () => {
    const newPage = vi
      .fn()
      .mockResolvedValueOnce(createMockPage({ fits: false }))
      .mockResolvedValueOnce(createMockPage({ fits: false }))
      .mockResolvedValueOnce(createMockPage({ fits: true }));

    launchMock.mockResolvedValue({ newPage });

    const renderEngineCardPng = await loadRenderEngine();
    const buf = await renderEngineCardPng({
      username: 'U',
      content: 'x',
      timeHHmm: '09:00',
      avatarBackgroundImage: 'none',
      rhythmLine: 'Ритм: 5',
    }, 'engine_log');

    expect(newPage).toHaveBeenCalledTimes(3);
    expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
  });

  it('returns first PNG as fallback when no preset fits', async () => {
    launchMock.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(createMockPage({ fits: false })),
    });

    const renderEngineCardPng = await loadRenderEngine();
    const buf = await renderEngineCardPng({
      username: 'U',
      content: 'y',
      timeHHmm: '10:00',
      avatarBackgroundImage: 'none',
    }, 'engine_recap');

    expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
    expect(launchMock).toHaveBeenCalledTimes(1);
  });
});
