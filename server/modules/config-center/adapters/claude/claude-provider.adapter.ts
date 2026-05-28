import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { backupFileIfExists } from '@/modules/config-center/adapters/shared/backup.js';
import { writeJsonFileAtomic } from '@/modules/config-center/adapters/shared/atomic-write.js';
import type { ApplyProviderResult } from '@/modules/config-center/config-center.types.js';
import type { ConfigProvider } from '@/modules/database/index.js';
import { AppError, readObjectRecord, readOptionalString } from '@/shared/utils.js';

const MANAGED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'CLAUDE_CODE_ATTRIBUTION_HEADER',
  'API_TIMEOUT_MS',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
];

const INTERNAL_FIELDS = [
  'api_format',
  'apiFormat',
  'openrouter_compat_mode',
  'openrouterCompatMode',
];

const getClaudeSettingsPath = (): string => path.join(os.homedir(), '.claude', 'settings.json');

const readJsonFile = async (filePath: string): Promise<Record<string, unknown>> => {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return readObjectRecord(parsed) ?? {};
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {};
    }
    throw error;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const VALID_META_API_FORMATS = ['anthropic', 'openai_chat', 'openai_responses', 'gemini_native'];
const VALID_META_API_KEY_FIELDS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'];

const throwInvalidMeta = (message: string): never => {
  throw new AppError(message, {
    code: 'INVALID_CLAUDE_PROVIDER_META',
    statusCode: 400,
  });
};

const validateMeta = (meta: unknown): void => {
  if (meta === undefined || meta === null) {
    return;
  }
  if (!isPlainObject(meta)) {
    throwInvalidMeta('Claude provider meta must be an object.');
  }
  const metaRecord = meta as Record<string, unknown>;

  if (
    metaRecord.apiFormat !== undefined &&
    (typeof metaRecord.apiFormat !== 'string' || !VALID_META_API_FORMATS.includes(metaRecord.apiFormat))
  ) {
    throwInvalidMeta('Claude provider meta.apiFormat is invalid.');
  }

  if (
    metaRecord.apiKeyField !== undefined &&
    (typeof metaRecord.apiKeyField !== 'string' || !VALID_META_API_KEY_FIELDS.includes(metaRecord.apiKeyField))
  ) {
    throwInvalidMeta('Claude provider meta.apiKeyField is invalid.');
  }

  if (metaRecord.isFullUrl !== undefined && typeof metaRecord.isFullUrl !== 'boolean') {
    throwInvalidMeta('Claude provider meta.isFullUrl must be a boolean.');
  }

  if (
    metaRecord.customEndpoints !== undefined &&
    (!Array.isArray(metaRecord.customEndpoints) ||
      metaRecord.customEndpoints.some((entry) => typeof entry !== 'string'))
  ) {
    throwInvalidMeta('Claude provider meta.customEndpoints must be a string array.');
  }
};

const sanitizeForLive = (value: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...value };
  for (const field of INTERNAL_FIELDS) {
    delete next[field];
  }
  return next;
};

const maskClaudeSecrets = (settings: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...settings };
  const env = readObjectRecord(next.env);
  if (!env) return next;

  const nextEnv = { ...env };
  for (const key of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']) {
    if (typeof nextEnv[key] === 'string' && nextEnv[key]) {
      nextEnv[key] = '••••••••';
    }
  }
  next.env = nextEnv;
  return next;
};

const validateEnv = (env: unknown): void => {
  if (env === undefined) {
    return;
  }
  if (!isPlainObject(env)) {
    throw new AppError('Claude provider env must be an object.', {
      code: 'INVALID_CLAUDE_PROVIDER_ENV',
      statusCode: 400,
    });
  }

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new AppError(`Claude provider env value for ${key} must be a string.`, {
        code: 'INVALID_CLAUDE_PROVIDER_ENV_VALUE',
        statusCode: 400,
      });
    }
  }

  const baseUrl = readOptionalString(env.ANTHROPIC_BASE_URL);
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new AppError('ANTHROPIC_BASE_URL must be a valid http or https URL.', {
        code: 'INVALID_CLAUDE_BASE_URL',
        statusCode: 400,
      });
    }
  }
};

const validateStringArrayField = (value: unknown, fieldName: string): void => {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new AppError(`Claude provider permissions.${fieldName} must be a string array.`, {
      code: 'INVALID_CLAUDE_PERMISSIONS',
      statusCode: 400,
    });
  }
};

const validatePermissions = (permissions: unknown): void => {
  if (permissions === undefined) {
    return;
  }
  if (!isPlainObject(permissions)) {
    throw new AppError('Claude provider permissions must be an object.', {
      code: 'INVALID_CLAUDE_PERMISSIONS',
      statusCode: 400,
    });
  }
  validateStringArrayField(permissions.allow, 'allow');
  validateStringArrayField(permissions.deny, 'deny');
  validateStringArrayField(permissions.ask, 'ask');
};

const mergeClaudeProviderIntoSettings = (
  currentSettings: Record<string, unknown>,
  providerSettings: Record<string, unknown>,
): Record<string, unknown> => {
  const next = { ...currentSettings, ...providerSettings };
  const existingEnv = readObjectRecord(currentSettings.env) ?? {};
  const providerEnv = readObjectRecord(providerSettings.env) ?? {};
  const nextEnv: Record<string, unknown> = { ...existingEnv };

  for (const [key, value] of Object.entries(providerEnv)) {
    if (typeof value === 'string' && value.trim()) {
      nextEnv[key] = value.trim();
    } else {
      delete nextEnv[key];
    }
  }

  for (const key of MANAGED_ENV_KEYS) {
    if (!(key in providerEnv)) continue;
    const value = providerEnv[key];
    if (typeof value !== 'string' || !value.trim()) delete nextEnv[key];
  }

  next.env = nextEnv;

  const permissions = readObjectRecord(providerSettings.permissions);
  if (permissions) {
    next.permissions = permissions;
  }

  return sanitizeForLive(next);
};

export class ClaudeProviderAdapter {
  validateProvider(provider: ConfigProvider): void {
    validateEnv(provider.settingsConfig.env);
    validatePermissions(provider.settingsConfig.permissions);
    validateMeta(provider.meta);
  }

  async readCurrentConfig(): Promise<Record<string, unknown> | null> {
    const settings = await readJsonFile(getClaudeSettingsPath());
    const env = readObjectRecord(settings.env) ?? {};
    const permissions = readObjectRecord(settings.permissions);
    const providerEnv: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.trim()) {
        providerEnv[key] = value;
      }
    }

    const providerSettings = { ...settings };
    delete providerSettings.env;
    delete providerSettings.permissions;

    if (Object.keys(providerEnv).length === 0 && !permissions && Object.keys(providerSettings).length === 0) {
      return null;
    }

    return {
      ...providerSettings,
      ...(Object.keys(providerEnv).length > 0 ? { env: providerEnv } : {}),
      ...(permissions ? { permissions } : {}),
    };
  }

  async previewSettings(settingsConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
    validateEnv(settingsConfig.env);
    validatePermissions(settingsConfig.permissions);

    const currentSettings = await readJsonFile(getClaudeSettingsPath());
    const nextSettings = mergeClaudeProviderIntoSettings(currentSettings, settingsConfig);
    return maskClaudeSecrets(nextSettings);
  }

  async applyProvider(provider: ConfigProvider): Promise<ApplyProviderResult> {
    this.validateProvider(provider);

    const settingsPath = getClaudeSettingsPath();
    const backup = await backupFileIfExists('claude', 'provider', settingsPath);
    const currentSettings = await readJsonFile(settingsPath);
    const nextSettings = mergeClaudeProviderIntoSettings(currentSettings, provider.settingsConfig);
    await writeJsonFileAtomic(settingsPath, nextSettings);

    return {
      appType: 'claude',
      providerId: provider.id,
      writtenFiles: [settingsPath],
      backups: backup ? [backup] : [],
    };
  }
}
