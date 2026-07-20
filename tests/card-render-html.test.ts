import { describe, it, expect } from 'vitest';
import { buildCardHtmlFromTemplate } from '../src/services/card-render-shared.js';

const LONG_CARD_CONTENT = `Первый реальный выход в рынок

На этой неделе сделал важный шаг — вышел в кофейни с продуктом. Формально всё просто: зашёл в пять точек, пообщался, понял, как они работают с поставщиками и кто у них отвечает за закупку кофе.

Фактически это был барьер. Самое сложное — решиться на первый холодный заход и начать разговор без тёплого знакомства.

Результат: договорился о трёх дегустациях с ЛПР. Инсайт — интерес есть почти сразу, главное дойти до живого диалога.

Дальше начинается настоящая проверка: конверсия дегустаций в закупки и обратная связь по продукту.`;

describe('buildCardHtmlFromTemplate', () => {
  it('replaces placeholders and escapes HTML in content', async () => {
    const html = await buildCardHtmlFromTemplate(
      'declaration-card.html',
      {
        username: 'Test & <User>',
        content: 'Line1\n<script>x</script>',
        timeHHmm: '14:30',
        avatarBackgroundImage: 'none',
        rhythmLine: 'Ритм: 7',
      },
      { designH: 1080, cardMinH: 1044 },
      'declaration'
    );
    expect(html).toContain('Test &amp; &lt;User&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('{{USERNAME}}');
    expect(html).not.toContain('{{CONTENT}}');
    expect(html).toContain('Приоритет недели');
    expect(html).toContain('Ритм: 7');
    expect(html).not.toContain('{{BADGE_IMAGE}}');
    expect(html).toContain('14:30');
  });

  it('fixation card keeps hardcoded daily title', async () => {
    const html = await buildCardHtmlFromTemplate(
      'fixation-card.html',
      {
        username: 'U',
        content: 'step',
        timeHHmm: '21:00',
        avatarBackgroundImage: 'none',
      },
      { designH: 1080, cardMinH: 1044 },
      'fixation'
    );
    expect(html).toContain('Фиксация дня');
  });

  it('inlines Roboto variable font as data URL', async () => {
    const html = await buildCardHtmlFromTemplate(
      'fixation-card.html',
      {
        username: 'U',
        content: 'c',
        timeHHmm: '09:00',
        avatarBackgroundImage: 'none',
      },
      { designH: 1350, cardMinH: 1314 },
      'fixation'
    );
    expect(html).toContain('data:font/ttf;base64,');
    expect(html).not.toContain('../../fonts/Roboto-Variable.ttf');
  });

  it('substitutes type scale for card typography', async () => {
    const html = await buildCardHtmlFromTemplate(
      'fixation-card.html',
      {
        username: 'U',
        content: LONG_CARD_CONTENT,
        timeHHmm: '09:00',
        avatarBackgroundImage: 'none',
      },
      { designH: 1920, cardMinH: 1884, typeScale: 0.9 },
      'fixation'
    );
    expect(html).toContain('--type-scale: 0.9');
    expect(html).not.toContain('{{TYPE_SCALE}}');
    expect(html).toContain('Первый реальный выход в рынок');
    expect(html).toContain('конверсия дегустаций в закупки');
  });
});
