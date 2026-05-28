import { safeOutboundRequest } from '@/modules/config-center/providers/outbound-url-safety.js';
import { AppError } from '@/shared/utils.js';

export type FetchClaudeProviderModelsInput = {
  baseUrl: string;
  apiKey: string;
  isFullUrl?: boolean;
  modelsUrl?: string | null;
};

export type ClaudeProviderModel = {
  id: string;
  ownedBy: string | null;
};

const FETCH_TIMEOUT_MS = 15_000;
const ERROR_BODY_MAX_CHARS = 300;

const KNOWN_COMPAT_SUFFIXES = [
  '/api/claudecode',
  '/api/anthropic',
  '/apps/anthropic',
  '/api/coding',
  '/claudecode',
  '/anthropic',
  '/step_plan',
  '/coding',
  '/claude',
];

const trimBody = (body: string): string => (
  body.length > ERROR_BODY_MAX_CHARS ? `${body.slice(0, ERROR_BODY_MAX_CHARS)}…` : body
);

const stripCompatSuffix = (value: string): string | null => {
  const lower = value.toLowerCase();
  const suffix = KNOWN_COMPAT_SUFFIXES.find((entry) => lower.endsWith(entry));
  return suffix ? value.slice(0, -suffix.length) : null;
};

const pushUnique = (items: string[], value: string): void => {
  if (value && !items.includes(value)) items.push(value);
};

export function buildModelUrlCandidates(baseUrl: string, isFullUrl = false, modelsUrl?: string | null): string[] {
  const override = modelsUrl?.trim();
  if (override) return [override];

  const trimmed = baseUrl.trim().replace(/\/+$/g, '');
  if (!trimmed) {
    throw new AppError('Base URL is required.', { code: 'CLAUDE_MODELS_BASE_URL_REQUIRED', statusCode: 400 });
  }

  const candidates: string[] = [];
  if (isFullUrl) {
    const v1Index = trimmed.indexOf('/v1/');
    if (v1Index >= 0) {
      pushUnique(candidates, `${trimmed.slice(0, v1Index)}/v1/models`);
    } else if (trimmed.endsWith('/v1')) {
      pushUnique(candidates, `${trimmed}/models`);
    } else {
      throw new AppError('Cannot derive models endpoint from full URL.', {
        code: 'CLAUDE_MODELS_URL_DERIVE_FAILED',
        statusCode: 400,
      });
    }
    return candidates;
  }

  pushUnique(candidates, trimmed.endsWith('/v1') ? `${trimmed}/models` : `${trimmed}/v1/models`);
  const stripped = stripCompatSuffix(trimmed);
  if (stripped) {
    const root = stripped.replace(/\/+$/g, '');
    pushUnique(candidates, `${root}/v1/models`);
    pushUnique(candidates, `${root}/models`);
  }
  return candidates;
}

const parseModelsResponse = (payload: unknown): ClaudeProviderModel[] => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new AppError('Model list response must be OpenAI-style { data: [...] }.', {
      code: 'CLAUDE_MODELS_INVALID_RESPONSE',
      statusCode: 502,
    });
  }

  return (payload as { data: Array<Record<string, unknown>> }).data
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      ownedBy: typeof item.owned_by === 'string' ? item.owned_by : null,
    }))
    .filter((item) => item.id)
    .sort((a, b) => a.id.localeCompare(b.id));
};

export async function fetchClaudeProviderModels(input: FetchClaudeProviderModelsInput): Promise<ClaudeProviderModel[]> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new AppError('API Key is required to fetch models.', {
      code: 'CLAUDE_MODELS_API_KEY_REQUIRED',
      statusCode: 400,
    });
  }

  const candidates = buildModelUrlCandidates(input.baseUrl, Boolean(input.isFullUrl), input.modelsUrl);
  let lastError = 'no candidates';

  for (const url of candidates) {
    try {
      const response = await safeOutboundRequest(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      if (response.ok) {
        return parseModelsResponse(response.json());
      }
      const body = trimBody(response.text);
      lastError = `HTTP ${response.status}: ${body}`;
      if (response.status !== 404 && response.status !== 405) {
        throw new AppError(lastError, { code: 'CLAUDE_MODELS_FETCH_FAILED', statusCode: response.status });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      throw new AppError(`Request failed: ${lastError}`, { code: 'CLAUDE_MODELS_FETCH_FAILED', statusCode: 502 });
    }
  }

  throw new AppError(`All model endpoint candidates failed: ${lastError}`, {
    code: 'CLAUDE_MODELS_ALL_CANDIDATES_FAILED',
    statusCode: 502,
  });
}
