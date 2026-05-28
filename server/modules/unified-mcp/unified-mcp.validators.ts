import { AppError } from '@/shared/utils.js';
import type { UnifiedMcpApp, UnifiedMcpAppStates, UnifiedMcpServerConfig } from './unified-mcp.types.js';
import { UNIFIED_MCP_APPS } from './unified-mcp.types.js';

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readStringArray = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined
);

const readStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const readEnabled = (value: unknown): UnifiedMcpAppStates => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    claude: record.claude === true,
    codex: record.codex === true,
    gemini: record.gemini === true,
    cursor: record.cursor === true,
  };
};

export const parseUnifiedMcpApp = (value: unknown): UnifiedMcpApp => {
  if (typeof value === 'string' && UNIFIED_MCP_APPS.includes(value as UnifiedMcpApp)) {
    return value as UnifiedMcpApp;
  }

  throw new AppError('Unsupported unified MCP app.', {
    code: 'UNSUPPORTED_UNIFIED_MCP_APP',
    statusCode: 400,
  });
};

export const parseUnifiedMcpPayload = (payload: unknown): {
  name: string;
  description: string | null;
  tags: string[];
  serverConfig: UnifiedMcpServerConfig;
  enabled: UnifiedMcpAppStates;
} => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const body = payload as Record<string, unknown>;
  const name = readString(body.name);
  if (!name) {
    throw new AppError('name is required.', {
      code: 'UNIFIED_MCP_NAME_REQUIRED',
      statusCode: 400,
    });
  }

  const transport = readString(body.transport);
  if (transport !== 'stdio' && transport !== 'http' && transport !== 'sse') {
    throw new AppError('transport must be stdio, http, or sse.', {
      code: 'INVALID_UNIFIED_MCP_TRANSPORT',
      statusCode: 400,
    });
  }

  return {
    name,
    description: readString(body.description) ?? null,
    tags: readStringArray(body.tags) ?? [],
    serverConfig: {
      transport,
      command: readString(body.command),
      args: readStringArray(body.args),
      env: readStringRecord(body.env),
      cwd: readString(body.cwd),
      url: readString(body.url),
      headers: readStringRecord(body.headers),
      envVars: readStringArray(body.envVars),
      bearerTokenEnvVar: readString(body.bearerTokenEnvVar),
      envHttpHeaders: readStringRecord(body.envHttpHeaders),
    },
    enabled: readEnabled(body.enabled),
  };
};
