import { describe, it, expect } from 'vitest';
import { dispatch } from '../src/bot/dispatch.js';
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

describe('dispatch: unknown commands', () => {
  it('replies with idle message for unknown command event', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatch(ctx, { type: 'command', name: 'abracadabra' }, {} as any);
    expect(replies).toEqual([IDLE_COMMAND_LIST_REPLY]);
  });

  it('replies with idle message for unknown slash message', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatch(ctx, { type: 'message', text: '/abracadabra' }, {} as any);
    expect(replies).toEqual([IDLE_COMMAND_LIST_REPLY]);
  });
});

