import { describe, it, expect } from 'vitest';
import { dispatch } from '../src/bot/dispatch.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../src/bot/conversations.js';
import { IDLE_COMMAND_LIST_REPLY } from '../src/bot/idle-message.js';

function createTestCtx() {
  const replies: string[] = [];
  return {
    ctx: {
      userId: 'u1',
      channel: 'telegram' as const,
      externalId: 'ext1',
      session: {},
      async reply(text: string) {
        replies.push(text);
      },
      async answerCallbackQuery() {},
    },
    replies,
  };
}

const founderDeps = {
  getUserProductMode: async () => 'founder' as const,
} as any;

describe('dispatch: unknown commands', () => {
  it('replies with idle message for unknown command event', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatch(ctx, { type: 'command', name: 'abracadabra' }, founderDeps);
    expect(replies).toEqual([IDLE_COMMAND_LIST_REPLY]);
  });

  it('replies with idle message for unknown slash message', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatch(ctx, { type: 'message', text: '/abracadabra' }, founderDeps);
    expect(replies).toEqual([IDLE_COMMAND_LIST_REPLY]);
  });

  it('choice step + plain text: button hint, not idle', async () => {
    const { ctx, replies } = createTestCtx();
    (ctx as { session: { step: string } }).session = { step: 'declaration_choice' };
    await dispatch(ctx, { type: 'message', text: 'просто текст' }, founderDeps);
    expect(replies).toEqual([FLOW_CHOICE_USE_BUTTONS_HINT]);
  });

  it('choice step + slash: idle (unknown command path), not button hint', async () => {
    const { ctx, replies } = createTestCtx();
    (ctx as { session: { step: string } }).session = { step: 'report_choice' };
    await dispatch(ctx, { type: 'message', text: '/nope' }, founderDeps);
    expect(replies).toEqual([IDLE_COMMAND_LIST_REPLY]);
  });
});

