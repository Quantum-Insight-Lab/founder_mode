import { describe, it, expect } from 'vitest';
import { buildCardHtmlFromTemplate } from '../src/services/card-render-shared.js';

describe('buildCardHtmlFromTemplate', () => {
  it('replaces placeholders and escapes HTML in content', async () => {
    const html = await buildCardHtmlFromTemplate(
      'declaration-card-1080.html',
      {
        username: 'Test & <User>',
        content: 'Line1\n<script>x</script>',
        timeHHmm: '14:30',
        avatarBackgroundImage: 'none',
      },
      'declaration'
    );
    expect(html).toContain('Test &amp; &lt;User&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('{{USERNAME}}');
    expect(html).not.toContain('{{CONTENT}}');
    expect(html).not.toContain('{{RHYTHM}}');
    expect(html).toContain('14:30');
  });

  it('inlines Roboto variable font as data URL', async () => {
    const html = await buildCardHtmlFromTemplate(
      'fixation-card-1350.html',
      {
        username: 'U',
        content: 'c',
        timeHHmm: '09:00',
        avatarBackgroundImage: 'none',
      },
      'fixation'
    );
    expect(html).toContain('data:font/ttf;base64,');
    expect(html).not.toContain('../../fonts/Roboto-Variable.ttf');
  });
});
