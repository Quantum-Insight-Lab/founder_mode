import type { Pool } from 'pg';
import type { createProjectors } from '../projectors/index.js';
import type { createLLMClient } from '../llm/client.js';

export interface ServiceDeps {
  pool: Pool;
  projectors: ReturnType<typeof createProjectors>;
  llm: ReturnType<typeof createLLMClient>;
}
