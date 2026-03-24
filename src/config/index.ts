import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';

export interface ReliabilityConfig {
  llm_request_timeout_ms: number;
  llm_max_retries: number;
  idempotency_key_ttl_hours: number;
}

export interface ObservabilityConfig {
  token_spike_threshold: number;
  token_spike_window_minutes: number;
}

export interface Config {
  reliability: ReliabilityConfig;
  observability: ObservabilityConfig;
}

let cached: Config | null = null;

/** Single entry point for config. Use config(), not loadConfig. */
export function loadConfig(): Config {
  if (cached) return cached;
  const path = resolve(process.cwd(), 'config/default.yaml');
  const content = readFileSync(path, 'utf-8');
  cached = parseYaml(content) as Config;
  return cached;
}

export const config = () => loadConfig();
