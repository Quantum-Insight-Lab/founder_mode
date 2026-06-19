import { describe, it, expect } from 'vitest';
import { dispatchClosure } from '../src/bot/dispatch-closure.js';
import { CLOSURE_IDLE_COMMAND_LIST_REPLY } from '../src/bot/closure-idle-message.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../src/bot/closure-conversations.js';

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

const closureDeps = {
  getUserProductMode: async () => 'closure' as const,
} as any;

describe('dispatchClosure', () => {
  it('replies with closure idle message for unknown command', async () => {
    const { ctx, replies } = createTestCtx();
    await dispatchClosure(ctx, { type: 'command', name: 'abracadabra' }, closureDeps);
    expect(replies).toEqual([CLOSURE_IDLE_COMMAND_LIST_REPLY]);
  });

  it('matter_choice + plain text: button hint', async () => {
    const { ctx, replies } = createTestCtx();
    (ctx as { session: { step: string } }).session = { step: 'matter_choice' };
    await dispatchClosure(ctx, { type: 'message', text: 'hello' }, closureDeps);
    expect(replies).toEqual([FLOW_CHOICE_USE_BUTTONS_HINT]);
  });
});
