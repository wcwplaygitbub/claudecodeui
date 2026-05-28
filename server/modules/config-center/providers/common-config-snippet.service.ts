import { appConfigDb } from '@/modules/database/index.js';
import { AppError, readObjectRecord } from '@/shared/utils.js';

const COMMON_CONFIG_SNIPPET_PREFIX = 'config_center.common_config_snippet.';
const COMMON_CONFIG_SNIPPET_CLEARED_PREFIX = 'config_center.common_config_snippet_cleared.';
const CLAUDE_DIFFERENTIATED_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_REASONING_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
]);

const keyForApp = (appType: string): string => `${COMMON_CONFIG_SNIPPET_PREFIX}${appType}`;
const clearedKeyForApp = (appType: string): string => `${COMMON_CONFIG_SNIPPET_CLEARED_PREFIX}${appType}`;

const validateJsonSnippet = (snippet: string): void => {
  if (!snippet.trim()) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(snippet);
  } catch {
    throw new AppError('通用配置片段JSON格式错误，请检查语法', {
      code: 'INVALID_COMMON_CONFIG_SNIPPET_JSON',
      statusCode: 400,
    });
  }

  if (!readObjectRecord(parsed)) {
    throw new AppError('通用配置片段必须是 JSON 对象', {
      code: 'INVALID_COMMON_CONFIG_SNIPPET_JSON',
      statusCode: 400,
    });
  }
};

const extractClaudeSnippet = (settingsConfig?: string): string => {
  if (!settingsConfig?.trim()) return '{}';

  let parsed: unknown;
  try {
    parsed = JSON.parse(settingsConfig);
  } catch {
    throw new AppError('配置 JSON 解析失败，无法提取通用配置', {
      code: 'INVALID_PROVIDER_SETTINGS_CONFIG_JSON',
      statusCode: 400,
    });
  }

  const config = readObjectRecord(parsed);
  if (!config) {
    throw new AppError('配置必须是 JSON 对象', {
      code: 'INVALID_PROVIDER_SETTINGS_CONFIG_JSON',
      statusCode: 400,
    });
  }

  const snippet: Record<string, unknown> = { ...config };
  delete snippet.apiBaseUrl;
  delete snippet.primaryModel;
  delete snippet.smallFastModel;

  const env = readObjectRecord(snippet.env);
  if (env) {
    const nextEnv = { ...env };
    for (const key of CLAUDE_DIFFERENTIATED_ENV_KEYS) {
      delete nextEnv[key];
    }
    if (Object.keys(nextEnv).length > 0) {
      snippet.env = nextEnv;
    } else {
      delete snippet.env;
    }
  }

  return JSON.stringify(snippet, null, 2);
};

export const commonConfigSnippetService = {
  get(appType: string): string | null {
    return appConfigDb.get(keyForApp(appType));
  },

  set(appType: string, snippet: string): void {
    validateJsonSnippet(snippet);
    if (snippet.trim()) {
      appConfigDb.set(keyForApp(appType), snippet);
      appConfigDb.set(clearedKeyForApp(appType), 'false');
      return;
    }

    appConfigDb.set(keyForApp(appType), '');
    appConfigDb.set(clearedKeyForApp(appType), 'true');
  },

  extract(appType: string, settingsConfig?: string): string {
    if (appType === 'claude') return extractClaudeSnippet(settingsConfig);
    return '{}';
  },
};
