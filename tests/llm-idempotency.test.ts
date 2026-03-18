/**
 * INV-006: LLM idempotency — two requests with same key → one API call, one result
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbUrl = process.env.TEST_DATABASE_URL;

const mockCreate = vi.fn().mockResolvedValue({
  choices: [{ message: { content: 'cached response' } }],
  usage: { prompt_tokens: 10, completion_tokens: 20 },
});

const poolRef = vi.hoisted(() => ({ current: null as InstanceType<typeof Pool> | null }));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

vi.mock('../src/db/index.js', () => ({
  getPool: () => poolRef.current!,
}));

describe.skipIf(!dbUrl)('LLM idempotency (INV-006)', () => {
  beforeAll(async () => {
    const pool = new Pool({ connectionString: dbUrl });
    poolRef.current = pool;
    const sql = readFileSync(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf-8');
    await pool.query(sql);
  });

  beforeEach(async () => {
    mockCreate.mockClear();
  });

  it('second request with same idempotency_key returns cached, API called once', async () => {
    if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-key';

    const { createLLMClient } = await import('../src/llm/client.js');
    const client = createLLMClient();
    const key = `inv006-test-${Date.now()}`;

    const r1 = await client.complete('sys', 'user', { idempotencyKey: key });
    const r2 = await client.complete('sys', 'user', { idempotencyKey: key });

    expect(r1.content).toBe('cached response');
    expect(r2.content).toBe('cached response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
