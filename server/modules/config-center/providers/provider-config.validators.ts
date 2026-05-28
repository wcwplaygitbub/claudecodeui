import { AppError, readObjectRecord, readOptionalString } from '@/shared/utils.js';

export const CONFIG_CENTER_APP_TYPES = ['claude'] as const;
export type ConfigCenterAppType = typeof CONFIG_CENTER_APP_TYPES[number];

const PROVIDER_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,80}$/;

export function parseConfigCenterAppType(value: unknown): ConfigCenterAppType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'claude') {
    return normalized;
  }

  throw new AppError(`Unsupported config center app "${normalized}".`, {
    code: 'UNSUPPORTED_CONFIG_CENTER_APP',
    statusCode: 400,
  });
}

export function parseProviderId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!PROVIDER_ID_PATTERN.test(id)) {
    throw new AppError('Provider id must be 1-80 characters and contain only letters, numbers, dots, underscores, or dashes.', {
      code: 'INVALID_PROVIDER_ID',
      statusCode: 400,
    });
  }
  return id;
}

export function parseProviderPayload(payload: unknown): {
  id?: string;
  name: string;
  settingsConfig: Record<string, unknown>;
  category?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  icon?: string | null;
  iconColor?: string | null;
  meta?: Record<string, unknown>;
} {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const name = readOptionalString(body.name);
  if (!name) {
    throw new AppError('Provider name is required.', {
      code: 'PROVIDER_NAME_REQUIRED',
      statusCode: 400,
    });
  }

  const settingsConfig = readObjectRecord(body.settingsConfig);
  if (!settingsConfig) {
    throw new AppError('settingsConfig must be an object.', {
      code: 'INVALID_PROVIDER_SETTINGS_CONFIG',
      statusCode: 400,
    });
  }

  const id = body.id === undefined ? undefined : parseProviderId(body.id);

  return {
    id,
    name,
    settingsConfig,
    category: readOptionalString(body.category) ?? null,
    websiteUrl: readOptionalString(body.websiteUrl) ?? null,
    notes: readOptionalString(body.notes) ?? null,
    icon: readOptionalString(body.icon) ?? null,
    iconColor: readOptionalString(body.iconColor) ?? null,
    meta: readObjectRecord(body.meta) ?? {},
  };
}

export function parsePreviewClaudeSettingsPayload(payload: unknown): { settingsConfig: Record<string, unknown> } {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const settingsConfig = readObjectRecord(body.settingsConfig);
  if (!settingsConfig) {
    throw new AppError('settingsConfig must be an object.', {
      code: 'INVALID_PROVIDER_SETTINGS_CONFIG',
      statusCode: 400,
    });
  }

  return { settingsConfig };
}

export type FetchClaudeModelsInput = {
  baseUrl: string;
  apiKey: string;
  isFullUrl?: boolean;
  modelsUrl?: string | null;
};

const readRequiredRequestString = (value: unknown, fieldName: string): string => {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new AppError(`${fieldName} is required.`, {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }
  return normalized;
};

export const parseFetchClaudeModelsInput = (payload: unknown): FetchClaudeModelsInput => {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  return {
    baseUrl: readRequiredRequestString(body.baseUrl, 'baseUrl'),
    apiKey: readRequiredRequestString(body.apiKey, 'apiKey'),
    isFullUrl: body.isFullUrl === true,
    modelsUrl: body.modelsUrl === undefined || body.modelsUrl === null
      ? null
      : readRequiredRequestString(body.modelsUrl, 'modelsUrl'),
  };
};

export type SpeedTestClaudeEndpointsInput = {
  urls: string[];
  timeoutSecs?: number;
  apiKey?: string;
  apiKeyField?: string;
};

export const parseSpeedTestClaudeEndpointsInput = (payload: unknown): SpeedTestClaudeEndpointsInput => {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  if (!Array.isArray(body.urls) || body.urls.length < 1 || body.urls.length > 20 || body.urls.some((entry) => typeof entry !== 'string')) {
    throw new AppError('urls must be a string array with 1-20 entries.', {
      code: 'INVALID_SPEED_TEST_URLS',
      statusCode: 400,
    });
  }

  if (body.timeoutSecs !== undefined && (typeof body.timeoutSecs !== 'number' || !Number.isFinite(body.timeoutSecs) || body.timeoutSecs <= 0)) {
    throw new AppError('timeoutSecs must be a finite positive number.', {
      code: 'INVALID_SPEED_TEST_TIMEOUT',
      statusCode: 400,
    });
  }

  return {
    urls: body.urls,
    timeoutSecs: body.timeoutSecs,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    apiKeyField: typeof body.apiKeyField === 'string' ? body.apiKeyField : undefined,
  };
};

export function parseDuplicateProviderPayload(payload: unknown): { id: string; name: string } {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const id = parseProviderId(body.id);
  const name = readOptionalString(body.name);
  if (!name) {
    throw new AppError('Provider name is required.', {
      code: 'PROVIDER_NAME_REQUIRED',
      statusCode: 400,
    });
  }

  return { id, name };
}

export function parseImportCurrentPayload(payload: unknown): { id: string; name: string } {
  return parseDuplicateProviderPayload(payload);
}

export function parseCommonConfigSnippetPayload(payload: unknown): { snippet: string } {
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  if (typeof body.snippet !== 'string') {
    throw new AppError('snippet must be a string.', {
      code: 'INVALID_COMMON_CONFIG_SNIPPET',
      statusCode: 400,
    });
  }

  if (body.snippet.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.snippet);
    } catch {
      throw new AppError('通用配置片段JSON格式错误，请检查语法', {
        code: 'INVALID_COMMON_CONFIG_SNIPPET_JSON',
        statusCode: 400,
      });
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AppError('通用配置片段必须是 JSON 对象', {
        code: 'INVALID_COMMON_CONFIG_SNIPPET_JSON',
        statusCode: 400,
      });
    }
  }

  return { snippet: body.snippet };
}

export function parseExtractCommonConfigSnippetPayload(payload: unknown): { settingsConfig?: string } {
  if (payload === undefined || payload === null) return {};
  const body = readObjectRecord(payload);
  if (!body) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  return {
    settingsConfig: typeof body.settingsConfig === 'string' ? body.settingsConfig : undefined,
  };
}
