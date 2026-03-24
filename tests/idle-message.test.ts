import { describe, it, expect } from 'vitest';
import { IDLE_COMMAND_LIST_REPLY } from '../src/bot/idle-message.js';

describe('idle-message', () => {
  it('keeps static fallback list for idle state', () => {
    expect(IDLE_COMMAND_LIST_REPLY).toBe('Команды: /declaration /report /fixation /settings /delete');
  });
});
