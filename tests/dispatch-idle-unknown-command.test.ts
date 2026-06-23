import { describe, it, expect } from 'vitest';
import { dispatchEngine } from '../src/bot/dispatch-engine.js';
import { getModeConfig } from '../src/modes/registry.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../src/modes/shared.js';

function createTestCtx(session: Record<string, unknown> = {}) {
  const replies: string[] = [];
  return {
    ctx: {
      userId: 'u1',
      channel: 'telegram' as const,
      externalId: 'ext1',
      session,
      async reply(text: string) {
        replies.push(text);
      },
      async answerCallbackQuery() {},
    },
    replies,
  };
}

const learningDeps = {
  getUserProductMode: async () => 'learning' as const,
} as any;

describe('dispatchEngine: unknown commands', () => {
  it('replies with idle message for unknown command event', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatchEngine(ctx, { type: 'command', name: 'abracadabra' }, learningDeps);
    expect(replies).toEqual([getModeConfig('learning').idleReply]);
  });

  it('replies with idle message for unknown slash message', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatchEngine(ctx, { type: 'message', text: '/abracadabra' }, learningDeps);
    expect(replies).toEqual([getModeConfig('learning').idleReply]);
  });

  it('choice step + plain text: button hint, not idle', async () => {
    const { ctx, replies } = createTestCtx({ step: 'engine_focus_choice' });
    await dispatchEngine(ctx, { type: 'message', text: 'просто текст' }, learningDeps);
    expect(replies).toEqual([FLOW_CHOICE_USE_BUTTONS_HINT]);
  });

  it('choice step + slash: silent return (no button hint, no idle)', async () => {
    const { ctx, replies } = createTestCtx({ step: 'engine_recap_choice' });
    await dispatchEngine(ctx, { type: 'message', text: '/nope' }, learningDeps);
    expect(replies).toEqual([]);
  });
});
