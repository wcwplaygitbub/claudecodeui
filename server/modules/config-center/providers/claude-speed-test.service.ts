import { safeOutboundRequest } from '@/modules/config-center/providers/outbound-url-safety.js';

export type EndpointLatency = {
  url: string;
  latency: number | null;
  status: number | null;
  error: string | null;
};

const DEFAULT_TOTAL_ENDPOINT_TIMEOUT_SECS = 10;
const MIN_TOTAL_ENDPOINT_TIMEOUT_SECS = 2;
const MAX_TOTAL_ENDPOINT_TIMEOUT_SECS = 15;
const MIN_REQUEST_ATTEMPT_TIMEOUT_MS = 1000;

export function sanitizeTimeoutSecs(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TOTAL_ENDPOINT_TIMEOUT_SECS;
  return Math.max(MIN_TOTAL_ENDPOINT_TIMEOUT_SECS, Math.min(MAX_TOTAL_ENDPOINT_TIMEOUT_SECS, Math.trunc(value as number)));
}

const remainingBudgetMs = (deadlineAt: number): number => deadlineAt - Date.now();

const warmUpBudgetMs = (remainingMs: number): number => Math.min(remainingMs, Math.max(MIN_REQUEST_ATTEMPT_TIMEOUT_MS, Math.floor(remainingMs / 2)));

async function testOneEndpoint(
  url: string,
  totalTimeoutMs: number,
  apiKey?: string,
  apiKeyField?: string,
): Promise<EndpointLatency> {
  const trimmed = url.trim();
  if (!trimmed) return { url, latency: null, status: null, error: 'URL is required' };
  const deadlineAt = Date.now() + totalTimeoutMs;

  const headers: Record<string, string> = {};
  if (apiKey) {
    const field = apiKeyField === 'ANTHROPIC_API_KEY' ? 'X-Api-Key' : 'Authorization';
    if (field === 'Authorization') {
      headers[field] = `Bearer ${apiKey}`;
    } else {
      headers[field] = apiKey;
    }
  }

  try {
    let remainingMs = remainingBudgetMs(deadlineAt);
    await safeOutboundRequest(trimmed, { method: 'GET', headers, timeoutMs: warmUpBudgetMs(remainingMs) });

    remainingMs = remainingBudgetMs(deadlineAt);
    if (remainingMs <= 0) throw new Error(`Request timed out after ${totalTimeoutMs}ms.`);

    const started = Date.now();
    const response = await safeOutboundRequest(trimmed, { method: 'GET', headers, timeoutMs: remainingMs });
    const latency = Date.now() - started;
    return {
      url: trimmed,
      latency,
      status: response.status,
      error: null,
    };
  } catch (error) {
    return {
      url: trimmed,
      latency: null,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testClaudeProviderEndpoints(
  urls: string[],
  timeoutSecs?: number,
  apiKey?: string,
  apiKeyField?: string,
): Promise<EndpointLatency[]> {
  if (urls.length === 0) return [];
  const timeoutMs = sanitizeTimeoutSecs(timeoutSecs) * 1000;
  return Promise.all(urls.map((url) => testOneEndpoint(url, timeoutMs, apiKey, apiKeyField)));
}