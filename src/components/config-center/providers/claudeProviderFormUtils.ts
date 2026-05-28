export type ClaudeApiFormat = 'anthropic' | 'openai_chat' | 'openai_responses' | 'gemini_native';
export type ClaudeApiKeyField = 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY';

export type ClaudeProviderFormValues = {
  id: string;
  name: string;
  notes: string;
  websiteUrl: string;
  apiKey: string;
  apiKeyField: ClaudeApiKeyField;
  baseUrl: string;
  isFullUrl: boolean;
  apiFormat: ClaudeApiFormat;
  defaultModel: string;
  sonnetDisplayName: string;
  sonnetModel: string;
  sonnetOneM: boolean;
  opusDisplayName: string;
  opusModel: string;
  opusOneM: boolean;
  haikuDisplayName: string;
  haikuModel: string;
  customEndpoints: string[];
  commonConfigEnabled?: boolean;
  originalSettingsConfig?: Record<string, unknown>;
  settingsConfigOverride?: Record<string, unknown>;
};

export type ConfigProvider = {
  id: string;
  appType: string;
  name: string;
  settingsConfig: Record<string, any>;
  category: string | null;
  websiteUrl: string | null;
  notes: string | null;
  meta?: Record<string, any> | null;
  isCurrent: boolean;
};

export const DEFAULT_CLAUDE_PROVIDER_FORM_VALUES: ClaudeProviderFormValues = {
  id: '',
  name: '',
  notes: '',
  websiteUrl: '',
  apiKey: '',
  apiKeyField: 'ANTHROPIC_AUTH_TOKEN',
  baseUrl: '',
  isFullUrl: false,
  apiFormat: 'anthropic',
  defaultModel: '',
  sonnetDisplayName: '',
  sonnetModel: '',
  sonnetOneM: false,
  opusDisplayName: '',
  opusModel: '',
  opusOneM: false,
  haikuDisplayName: '',
  haikuModel: '',
  customEndpoints: [],
};

const ONE_M_MARKER = '[1M]';

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');
const readBoolean = (value: unknown): boolean => value === true;
const isPlainObject = (value: unknown): value is Record<string, unknown> => Object.prototype.toString.call(value) === '[object Object]';

const deepClone = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepClone(entry)])) as T;
  }
  return value;
};

const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      deepMerge(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = value;
    }
  }
  return target;
};

const isSubset = (target: unknown, source: unknown): boolean => {
  if (isPlainObject(source)) {
    if (!isPlainObject(target)) return false;
    return Object.entries(source).every(([key, value]) => isSubset(target[key], value));
  }
  if (Array.isArray(source)) {
    return Array.isArray(target) && target.length === source.length && source.every((entry, index) => isSubset(target[index], entry));
  }
  return target === source;
};

const deepRemove = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue;
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepRemove(target[key] as Record<string, unknown>, value);
      if (Object.keys(target[key] as Record<string, unknown>).length === 0) delete target[key];
    } else if (isSubset(target[key], value)) {
      delete target[key];
    }
  }
};

const isClaudeApiFormat = (value: unknown): value is ClaudeApiFormat => (
  value === 'anthropic' ||
  value === 'openai_chat' ||
  value === 'openai_responses' ||
  value === 'gemini_native'
);

const isClaudeApiKeyField = (value: unknown): value is ClaudeApiKeyField => (
  value === 'ANTHROPIC_AUTH_TOKEN' || value === 'ANTHROPIC_API_KEY'
);

export function stripOneMMarker(model: string): string {
  const trimmedEnd = model.trimEnd();
  return trimmedEnd.toLowerCase().endsWith('[1m]')
    ? trimmedEnd.slice(0, -ONE_M_MARKER.length).trimEnd()
    : model;
}

export function hasOneMMarker(model: string): boolean {
  return model.trimEnd().toLowerCase().endsWith('[1m]');
}

export function setOneMMarker(model: string, enabled: boolean): string {
  const base = stripOneMMarker(model).trim();
  if (!base) return '';
  return enabled ? `${base}${ONE_M_MARKER}` : base;
}

export function getApiKeyFieldFromEnv(env: Record<string, unknown>, meta?: Record<string, unknown> | null): ClaudeApiKeyField {
  const metaApiKeyField = meta?.apiKeyField;
  if (isClaudeApiKeyField(metaApiKeyField) && readString(env[metaApiKeyField])) {
    return metaApiKeyField;
  }
  if (readString(env.ANTHROPIC_AUTH_TOKEN)) {
    return 'ANTHROPIC_AUTH_TOKEN';
  }
  if (readString(env.ANTHROPIC_API_KEY)) {
    return 'ANTHROPIC_API_KEY';
  }
  return isClaudeApiKeyField(metaApiKeyField) ? metaApiKeyField : 'ANTHROPIC_AUTH_TOKEN';
}

export function getApiKeyFromEnv(env: Record<string, unknown>): string {
  const authToken = readString(env.ANTHROPIC_AUTH_TOKEN);
  if (authToken) return authToken;
  return readString(env.ANTHROPIC_API_KEY);
}

export function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/g, '');
}

export function normalizeEndpointList(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizeEndpoint(value);
    if (normalized && !next.includes(normalized)) {
      next.push(normalized);
    }
  }
  return next;
}

export function applyClaudeSettingsConfigToFormValues(
  values: ClaudeProviderFormValues,
  settingsConfig: Record<string, unknown>,
): ClaudeProviderFormValues {
  const env = settingsConfig.env && typeof settingsConfig.env === 'object' && !Array.isArray(settingsConfig.env)
    ? settingsConfig.env as Record<string, unknown>
    : {};
  const selectedApiKeyField = getApiKeyFieldFromEnv(env, { apiKeyField: values.apiKeyField });
  const selectedApiKey = readString(env[selectedApiKeyField]) || getApiKeyFromEnv(env);
  const sonnetModel = readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  const opusModel = readString(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
  const haikuModel = readString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);

  return {
    ...values,
    apiKey: selectedApiKey && selectedApiKey !== '••••••••' ? selectedApiKey : values.apiKey,
    apiKeyField: selectedApiKeyField,
    baseUrl: readString(env.ANTHROPIC_BASE_URL),
    defaultModel: readString(env.ANTHROPIC_MODEL),
    sonnetDisplayName: readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME) || stripOneMMarker(sonnetModel),
    sonnetModel: stripOneMMarker(sonnetModel),
    sonnetOneM: hasOneMMarker(sonnetModel),
    opusDisplayName: readString(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME) || stripOneMMarker(opusModel),
    opusModel: stripOneMMarker(opusModel),
    opusOneM: hasOneMMarker(opusModel),
    haikuDisplayName: readString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME) || stripOneMMarker(haikuModel),
    haikuModel: stripOneMMarker(haikuModel),
  };
}

export function providerToClaudeFormValues(provider?: ConfigProvider | null): ClaudeProviderFormValues {
  if (!provider) {
    return {
      ...DEFAULT_CLAUDE_PROVIDER_FORM_VALUES,
      customEndpoints: [...DEFAULT_CLAUDE_PROVIDER_FORM_VALUES.customEndpoints],
    };
  }

  const env = provider.settingsConfig?.env && typeof provider.settingsConfig.env === 'object'
    ? provider.settingsConfig.env as Record<string, unknown>
    : {};
  const meta = provider.meta && typeof provider.meta === 'object' ? provider.meta : {};
  const customEndpoints = Array.isArray(meta.customEndpoints)
    ? meta.customEndpoints.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return applyClaudeSettingsConfigToFormValues({
    id: provider.id,
    name: provider.name,
    notes: provider.notes || '',
    websiteUrl: provider.websiteUrl || '',
    apiKey: '',
    apiKeyField: isClaudeApiKeyField(meta.apiKeyField) ? meta.apiKeyField : 'ANTHROPIC_AUTH_TOKEN',
    baseUrl: '',
    isFullUrl: readBoolean(meta.isFullUrl),
    apiFormat: isClaudeApiFormat(meta.apiFormat) ? meta.apiFormat : 'anthropic',
    defaultModel: '',
    sonnetDisplayName: '',
    sonnetModel: '',
    sonnetOneM: false,
    opusDisplayName: '',
    opusModel: '',
    opusOneM: false,
    haikuDisplayName: '',
    haikuModel: '',
    customEndpoints: normalizeEndpointList(customEndpoints),
    commonConfigEnabled: readBoolean(meta.commonConfigEnabled),
    originalSettingsConfig: provider.settingsConfig,
  }, provider.settingsConfig);
}

const setEnvValue = (env: Record<string, string>, key: string, value: string): void => {
  const trimmed = key === 'ANTHROPIC_BASE_URL' ? normalizeEndpoint(value) : value.trim();
  if (trimmed) env[key] = trimmed;
};

export function buildClaudeSettingsConfig(values: ClaudeProviderFormValues): Record<string, unknown> {
  const env: Record<string, string> = {};
  setEnvValue(env, 'ANTHROPIC_BASE_URL', values.baseUrl);
  const apiKey = values.apiKey.trim();
  if (apiKey) {
    env[values.apiKeyField] = apiKey;
  }
  setEnvValue(env, 'ANTHROPIC_MODEL', values.defaultModel);
  setEnvValue(env, 'ANTHROPIC_DEFAULT_SONNET_MODEL', setOneMMarker(values.sonnetModel, values.sonnetOneM));
  setEnvValue(env, 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME', values.sonnetDisplayName);
  setEnvValue(env, 'ANTHROPIC_DEFAULT_OPUS_MODEL', setOneMMarker(values.opusModel, values.opusOneM));
  setEnvValue(env, 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME', values.opusDisplayName);
  setEnvValue(env, 'ANTHROPIC_DEFAULT_HAIKU_MODEL', stripOneMMarker(values.haikuModel));
  setEnvValue(env, 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME', values.haikuDisplayName);
  return { env };
}

export function buildClaudeProviderMeta(values: ClaudeProviderFormValues): Record<string, unknown> {
  return {
    apiFormat: values.apiFormat,
    apiKeyField: values.apiKeyField,
    isFullUrl: values.isFullUrl,
    customEndpoints: normalizeEndpointList(values.customEndpoints),
    commonConfigEnabled: values.commonConfigEnabled === true,
  };
}

export function claudeFormValuesToPayload(values: ClaudeProviderFormValues) {
  return {
    id: values.id.trim(),
    name: values.name.trim(),
    notes: values.notes.trim() || null,
    websiteUrl: normalizeEndpoint(values.websiteUrl) || null,
    settingsConfig: values.settingsConfigOverride ?? buildClaudeSettingsConfig(values),
    meta: buildClaudeProviderMeta(values),
  };
}

export function buildPreviewConfig(values: ClaudeProviderFormValues, maskApiKey = true): Record<string, unknown> {
  const config = buildClaudeSettingsConfig(values) as { env: Record<string, string> };
  if (maskApiKey) {
    for (const key of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']) {
      if (config.env[key]) config.env[key] = '••••••••';
    }
  }
  return config;
}

export function buildPreviewSettingsPayload(values: ClaudeProviderFormValues): { settingsConfig: Record<string, unknown> } {
  return { settingsConfig: buildClaudeSettingsConfig(values) };
}

export const DEFAULT_COMMON_CONFIG_SNIPPET = `{
  "includeCoAuthoredBy": false
}`;

export function validateJsonConfig(value: string, fieldName = '配置'): string {
  if (!value.trim()) return '';
  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) return `${fieldName}必须是 JSON 对象`;
    return '';
  } catch {
    return `${fieldName}JSON格式错误，请检查语法`;
  }
}

export function updateCommonConfigSnippet(jsonString: string, snippetString: string, enabled: boolean): { updatedConfig: string; error?: string } {
  let config: Record<string, unknown>;
  try {
    config = jsonString.trim() ? JSON.parse(jsonString) : {};
  } catch {
    return { updatedConfig: jsonString, error: '配置 JSON 解析失败，无法写入通用配置' };
  }

  if (!snippetString.trim()) return { updatedConfig: JSON.stringify(config, null, 2) };

  const snippetError = validateJsonConfig(snippetString, '通用配置片段');
  if (snippetError) return { updatedConfig: JSON.stringify(config, null, 2), error: snippetError };

  const snippet = JSON.parse(snippetString) as Record<string, unknown>;
  if (enabled) return { updatedConfig: JSON.stringify(deepMerge(deepClone(config), snippet), null, 2) };

  const nextConfig = deepClone(config);
  deepRemove(nextConfig, snippet);
  return { updatedConfig: JSON.stringify(nextConfig, null, 2) };
}

export function hasCommonConfigSnippet(jsonString: string, snippetString: string): boolean {
  try {
    if (!snippetString.trim()) return false;
    const config = jsonString.trim() ? JSON.parse(jsonString) : {};
    const snippet = JSON.parse(snippetString);
    if (!isPlainObject(snippet)) return false;
    return isSubset(config, snippet);
  } catch {
    return false;
  }
}

export function applyOneClickModelMapping(values: ClaudeProviderFormValues): ClaudeProviderFormValues {
  const source = values.defaultModel || values.sonnetModel || values.opusModel || values.haikuModel;
  const base = stripOneMMarker(source).trim();
  if (!base) return values;
  return {
    ...values,
    sonnetModel: base,
    sonnetDisplayName: base,
    opusModel: base,
    opusDisplayName: base,
    haikuModel: base,
    haikuDisplayName: base,
  };
}
