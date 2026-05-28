import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, EyeOff, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';

import { api } from '../../../utils/api';
import { Button, Dialog, DialogContent, DialogTitle, Input } from '../../../shared/view/ui';
import {
  DEFAULT_CLAUDE_PROVIDER_FORM_VALUES,
  DEFAULT_COMMON_CONFIG_SNIPPET,
  applyClaudeSettingsConfigToFormValues,
  applyOneClickModelMapping,
  buildClaudeSettingsConfig,
  buildPreviewSettingsPayload,
  hasCommonConfigSnippet,
  normalizeEndpointList,
  updateCommonConfigSnippet,
  validateJsonConfig,
  type ClaudeApiFormat,
  type ClaudeApiKeyField,
  type ClaudeProviderFormValues,
} from './claudeProviderFormUtils';

export type ProviderFormValues = ClaudeProviderFormValues;

type ProviderFormModalProps = {
  open: boolean;
  isSaving: boolean;
  initialValues?: ProviderFormValues;
  onClose: () => void;
  onSubmit: (values: ProviderFormValues) => Promise<void>;
};

type ModelRole = 'sonnet' | 'opus' | 'haiku';

type ModelRow = {
  role: ModelRole;
  displayNameKey: 'sonnetDisplayName' | 'opusDisplayName' | 'haikuDisplayName';
  modelKey: 'sonnetModel' | 'opusModel' | 'haikuModel';
  oneMKey?: 'sonnetOneM' | 'opusOneM';
  labelKey: string;
};

type ModelFieldKey = 'defaultModel' | 'sonnetModel' | 'opusModel' | 'haikuModel';

type SpeedTestResult = {
  endpoint: string;
  ok: boolean;
  latencyMs?: number;
  status?: number;
  error?: string;
};

const modelRows: ModelRow[] = [
  {
    role: 'sonnet',
    displayNameKey: 'sonnetDisplayName',
    modelKey: 'sonnetModel',
    oneMKey: 'sonnetOneM',
    labelKey: 'configCenter.form.modelRoleSonnet',
  },
  {
    role: 'opus',
    displayNameKey: 'opusDisplayName',
    modelKey: 'opusModel',
    oneMKey: 'opusOneM',
    labelKey: 'configCenter.form.modelRoleOpus',
  },
  {
    role: 'haiku',
    displayNameKey: 'haikuDisplayName',
    modelKey: 'haikuModel',
    labelKey: 'configCenter.form.modelRoleHaiku',
  },
];

const apiFormatOptions: Array<{ value: ClaudeApiFormat; labelKey: string }> = [
  { value: 'anthropic', labelKey: 'configCenter.form.apiFormatAnthropic' },
  { value: 'openai_chat', labelKey: 'configCenter.form.apiFormatOpenAIChat' },
  { value: 'openai_responses', labelKey: 'configCenter.form.apiFormatOpenAIResponses' },
  { value: 'gemini_native', labelKey: 'configCenter.form.apiFormatGeminiNative' },
];

const apiKeyFieldOptions: ClaudeApiKeyField[] = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'];

const safeIdFromName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const selectClassName = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const checkboxClassName = 'h-4 w-4 rounded border-border';

const readError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    return data.error || data.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

const coerceInitialValues = (initialValues?: ProviderFormValues): ProviderFormValues => ({
  ...DEFAULT_CLAUDE_PROVIDER_FORM_VALUES,
  ...initialValues,
  customEndpoints: normalizeEndpointList(initialValues?.customEndpoints || DEFAULT_CLAUDE_PROVIDER_FORM_VALUES.customEndpoints),
});

const extractModelNames = (payload: unknown): string[] => {
  const data = payload as { data?: unknown; models?: unknown };
  const source = Array.isArray(data.models)
    ? data.models
    : typeof data.data === 'object' && data.data !== null && Array.isArray((data.data as { models?: unknown }).models)
      ? (data.data as { models: unknown[] }).models
      : [];

  return source
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'object' && entry !== null) {
        const record = entry as Record<string, unknown>;
        return typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : '';
      }
      return '';
    })
    .filter((name): name is string => Boolean(name));
};

const extractSpeedResults = (payload: unknown): SpeedTestResult[] => {
  const data = payload as { data?: unknown; results?: unknown };
  const source = Array.isArray(data.results)
    ? data.results
    : typeof data.data === 'object' && data.data !== null && Array.isArray((data.data as { results?: unknown }).results)
      ? (data.data as { results: unknown[] }).results
      : [];
  const results: SpeedTestResult[] = [];

  for (const entry of source) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const endpoint = typeof record.url === 'string' ? record.url : typeof record.endpoint === 'string' ? record.endpoint : '';
    if (!endpoint) continue;
    const latency = typeof record.latency === 'number'
      ? record.latency
      : typeof record.latencyMs === 'number'
        ? record.latencyMs
        : undefined;
    const status = typeof record.status === 'number' ? record.status : undefined;
    const error = typeof record.error === 'string' ? record.error : undefined;
    results.push({
      endpoint,
      ok: error == null && typeof latency === 'number',
      latencyMs: latency,
      status,
      error,
    });
  }

  return results;
};

const endpointListsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((endpoint, index) => endpoint === right[index]);

export default function ProviderFormModal({
  open,
  isSaving,
  initialValues,
  onClose,
  onSubmit,
}: ProviderFormModalProps) {
  const { t } = useTranslation('settings');
  const [values, setValues] = useState<ProviderFormValues>(coerceInitialValues());
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [endpointInput, setEndpointInput] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTestingEndpoints, setIsTestingEndpoints] = useState(false);
  const [speedResults, setSpeedResults] = useState<SpeedTestResult[]>([]);
  const [openModelPicker, setOpenModelPicker] = useState<ModelFieldKey | null>(null);
  const [modelFetchMessage, setModelFetchMessage] = useState<string | null>(null);
  const [speedTestMessage, setSpeedTestMessage] = useState<string | null>(null);
  const [localCommonConfig, setLocalCommonConfig] = useState<string>('{}');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [useCommonConfig, setUseCommonConfig] = useState(false);
  const [commonConfigSnippet, setCommonConfigSnippet] = useState(DEFAULT_COMMON_CONFIG_SNIPPET);
  const [commonConfigError, setCommonConfigError] = useState('');
  const [isCommonConfigLoading, setIsCommonConfigLoading] = useState(true);
  const [isCommonConfigModalOpen, setIsCommonConfigModalOpen] = useState(false);
  const [isExtractingCommonConfig, setIsExtractingCommonConfig] = useState(false);
  const [hasLoadedConfigJson, setHasLoadedConfigJson] = useState(false);
  const previewRequestIdRef = useRef(0);
  const hasEditedCommonConfigRef = useRef(false);
  const isUpdatingFromCommonConfigRef = useRef(false);
  const hasInitializedNewModeRef = useRef(false);
  const hasInitializedEditModeRef = useRef(false);
  const modelFetchRequestIdRef = useRef(0);
  const speedTestRequestIdRef = useRef(0);
  const valuesRef = useRef(values);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const isEditing = Boolean(initialValues);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (!open) return;
    const nextValues = coerceInitialValues(initialValues);
    valuesRef.current = nextValues;
    setValues(nextValues);
    setEndpointInput('');
    setError(null);
    setShowApiKey(false);
    setAvailableModels([]);
    modelFetchRequestIdRef.current += 1;
    setIsFetchingModels(false);
    speedTestRequestIdRef.current += 1;
    setIsTestingEndpoints(false);
    setSpeedResults([]);
    setOpenModelPicker(null);
    setModelFetchMessage(null);
    setSpeedTestMessage(null);
    previewRequestIdRef.current += 1;
    hasEditedCommonConfigRef.current = false;
    setLocalCommonConfig('{}');
    setHasLoadedConfigJson(false);
    setPreviewError(null);
    setCommonConfigError('');
    setIsCommonConfigModalOpen(false);
    setIsPreviewLoading(false);
    setUseCommonConfig(nextValues.commonConfigEnabled === true);
    hasInitializedNewModeRef.current = false;
    hasInitializedEditModeRef.current = false;
    isUpdatingFromCommonConfigRef.current = false;
  }, [initialValues, open]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const loadSnippet = async () => {
      setIsCommonConfigLoading(true);
      try {
        const response = await api.configCenter.providers.getCommonConfigSnippet('claude');
        if (!response.ok) throw new Error(await readError(response));
        const payload = await response.json();
        const snippet = typeof payload.data?.snippet === 'string' ? payload.data.snippet : '';
        if (mounted && snippet.trim()) setCommonConfigSnippet(snippet);
      } catch (err) {
        if (mounted) setCommonConfigError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setIsCommonConfigLoading(false);
      }
    };

    void loadSnippet();
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !openModelPicker) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (modelPickerRef.current?.contains(event.target as Node)) return;
      setOpenModelPicker(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, openModelPicker]);

  useEffect(() => {
    if (!open || hasEditedCommonConfigRef.current) return;

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    const timeout = window.setTimeout(async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);
      try {
        const response = await api.configCenter.providers.previewClaudeSettings(buildPreviewSettingsPayload(valuesRef.current));
        if (!response.ok) throw new Error(await readError(response));
        const payload = await response.json();
        if (previewRequestIdRef.current !== requestId || hasEditedCommonConfigRef.current) return;
        const settings = initialValues?.originalSettingsConfig || payload.data?.settings || {};
        const nextConfig = JSON.stringify(settings, null, 2);
        setLocalCommonConfig(nextConfig);
        setHasLoadedConfigJson(true);
        setUseCommonConfig(valuesRef.current.commonConfigEnabled === true || hasCommonConfigSnippet(nextConfig, commonConfigSnippet));
      } catch (err) {
        if (previewRequestIdRef.current !== requestId) return;
        setPreviewError(err instanceof Error ? err.message : String(err));
      } finally {
        if (previewRequestIdRef.current === requestId) {
          setIsPreviewLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [open, values]);

  useEffect(() => {
    if (!open || isCommonConfigLoading || !hasLoadedConfigJson || !initialValues || hasInitializedEditModeRef.current) return;
    hasInitializedEditModeRef.current = true;

    const inferredHasCommon = hasCommonConfigSnippet(localCommonConfig, commonConfigSnippet);
    const hasCommon = initialValues.commonConfigEnabled !== undefined ? initialValues.commonConfigEnabled : inferredHasCommon;
    setUseCommonConfig(hasCommon === true);

    if (hasCommon && !inferredHasCommon) {
      const { updatedConfig, error: snippetError } = updateCommonConfigSnippet(localCommonConfig, commonConfigSnippet, true);
      if (!snippetError) {
        isUpdatingFromCommonConfigRef.current = true;
        hasEditedCommonConfigRef.current = true;
        previewRequestIdRef.current += 1;
        setLocalCommonConfig(updatedConfig);
        window.setTimeout(() => {
          isUpdatingFromCommonConfigRef.current = false;
        }, 0);
      }
    }
  }, [commonConfigSnippet, hasLoadedConfigJson, initialValues, isCommonConfigLoading, localCommonConfig, open]);

  useEffect(() => {
    if (!open || isCommonConfigLoading || !hasLoadedConfigJson || initialValues || hasInitializedNewModeRef.current) return;
    hasInitializedNewModeRef.current = true;

    try {
      const snippet = JSON.parse(commonConfigSnippet);
      if (snippet && typeof snippet === 'object' && !Array.isArray(snippet) && Object.keys(snippet).length > 0) {
        const { updatedConfig, error: snippetError } = updateCommonConfigSnippet(localCommonConfig, commonConfigSnippet, true);
        if (!snippetError) {
          setUseCommonConfig(true);
          updateValue('commonConfigEnabled', true);
          isUpdatingFromCommonConfigRef.current = true;
          hasEditedCommonConfigRef.current = true;
          previewRequestIdRef.current += 1;
          setLocalCommonConfig(updatedConfig);
          window.setTimeout(() => {
            isUpdatingFromCommonConfigRef.current = false;
          }, 0);
        }
      }
    } catch {
      // Ignore invalid stored snippets.
    }
  }, [commonConfigSnippet, hasLoadedConfigJson, initialValues, isCommonConfigLoading, localCommonConfig, open]);

  useEffect(() => {
    if (!open || isCommonConfigLoading || !hasLoadedConfigJson || isUpdatingFromCommonConfigRef.current) return;
    setUseCommonConfig(hasCommonConfigSnippet(localCommonConfig, commonConfigSnippet));
  }, [commonConfigSnippet, hasLoadedConfigJson, isCommonConfigLoading, localCommonConfig, open]);

  const endpointsForTest = useMemo(
    () => normalizeEndpointList([values.baseUrl, ...values.customEndpoints]),
    [values.baseUrl, values.customEndpoints],
  );
  const fastestSuccessfulEndpoint = useMemo(
    () => speedResults
      .filter((result) => result.ok)
      .sort((left, right) => (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER))[0],
    [speedResults],
  );

  const syncLocalConfigFromValues = (nextValues: ProviderFormValues) => {
    if (!hasEditedCommonConfigRef.current) return;
    try {
      const currentConfig = JSON.parse(localCommonConfig || '{}');
      const providerConfig = buildClaudeSettingsConfig(nextValues);
      const nextConfig = {
        ...currentConfig,
        ...providerConfig,
        env: {
          ...((currentConfig.env && typeof currentConfig.env === 'object' && !Array.isArray(currentConfig.env)) ? currentConfig.env : {}),
          ...((providerConfig.env && typeof providerConfig.env === 'object' && !Array.isArray(providerConfig.env)) ? providerConfig.env : {}),
        },
      };
      setLocalCommonConfig(JSON.stringify(nextConfig, null, 2));
    } catch {
      // Keep invalid JSON untouched while the user edits it.
    }
  };

  const updateValue = <K extends keyof ProviderFormValues>(key: K, value: ProviderFormValues[K]) => {
    const nextValues = { ...valuesRef.current, [key]: value };
    valuesRef.current = nextValues;
    setValues((current) => ({ ...current, [key]: value }));
    if (key !== 'commonConfigEnabled') syncLocalConfigFromValues(nextValues);
    if (key === 'baseUrl' || key === 'apiKey' || key === 'isFullUrl') {
      setAvailableModels([]);
      modelFetchRequestIdRef.current += 1;
      setIsFetchingModels(false);
    }
    if (key === 'baseUrl' || key === 'customEndpoints') {
      speedTestRequestIdRef.current += 1;
      setIsTestingEndpoints(false);
      setSpeedResults([]);
      setSpeedTestMessage(null);
    }
    if (key !== 'customEndpoints' && !hasEditedCommonConfigRef.current) {
      previewRequestIdRef.current += 1;
      setIsPreviewLoading(false);
      setPreviewError(null);
    }
  };

  const handleNameChange = (name: string) => {
    setValues((current) => {
      const nextValues = {
        ...current,
        name,
        id: isEditing || current.id ? current.id : safeIdFromName(name),
      };
      valuesRef.current = nextValues;
      return nextValues;
    });
  };

  const addEndpoint = () => {
    const nextEndpoints = normalizeEndpointList([...values.customEndpoints, endpointInput]);
    updateValue('customEndpoints', nextEndpoints);
    setEndpointInput('');
  };

  const removeEndpoint = (endpoint: string) => {
    setValues((current) => {
      const nextValues = {
        ...current,
        customEndpoints: current.customEndpoints.filter((entry) => entry !== endpoint),
      };
      valuesRef.current = nextValues;
      return nextValues;
    });
    speedTestRequestIdRef.current += 1;
    setIsTestingEndpoints(false);
    setSpeedResults((current) => current.filter((result) => result.endpoint !== endpoint));
  };

  const selectFetchedModel = (field: ModelFieldKey, model: string) => {
    updateValue(field, model);
    setOpenModelPicker(null);
  };

  const toggleCommonConfig = (checked: boolean) => {
    const { updatedConfig, error: snippetError } = updateCommonConfigSnippet(localCommonConfig, commonConfigSnippet, checked);
    if (snippetError) {
      setCommonConfigError(snippetError);
      setUseCommonConfig(false);
      return;
    }

    setCommonConfigError('');
    setUseCommonConfig(checked);
    updateValue('commonConfigEnabled', checked);
    isUpdatingFromCommonConfigRef.current = true;
    hasEditedCommonConfigRef.current = true;
    previewRequestIdRef.current += 1;
    setLocalCommonConfig(updatedConfig);
    window.setTimeout(() => {
      isUpdatingFromCommonConfigRef.current = false;
    }, 0);
  };

  const handleCommonConfigSnippetChange = (value: string) => {
    const previousSnippet = commonConfigSnippet;
    setCommonConfigSnippet(value);

    if (!value.trim()) {
      setCommonConfigError('');
      void api.configCenter.providers.setCommonConfigSnippet('claude', '');
      if (useCommonConfig) {
        const { updatedConfig } = updateCommonConfigSnippet(localCommonConfig, previousSnippet, false);
        setLocalCommonConfig(updatedConfig);
        setUseCommonConfig(false);
        updateValue('commonConfigEnabled', false);
      }
      return;
    }

    const validationError = validateJsonConfig(value, '通用配置片段');
    if (validationError) {
      setCommonConfigError(validationError);
      return;
    }

    setCommonConfigError('');
    void api.configCenter.providers.setCommonConfigSnippet('claude', value).then(async (response) => {
      if (!response.ok) throw new Error(await readError(response));
    }).catch((err) => setCommonConfigError(err instanceof Error ? err.message : String(err)));

    if (useCommonConfig) {
      const removeResult = updateCommonConfigSnippet(localCommonConfig, previousSnippet, false);
      if (removeResult.error) {
        setCommonConfigError(removeResult.error);
        return;
      }
      const addResult = updateCommonConfigSnippet(removeResult.updatedConfig, value, true);
      if (addResult.error) {
        setCommonConfigError(addResult.error);
        return;
      }
      isUpdatingFromCommonConfigRef.current = true;
      hasEditedCommonConfigRef.current = true;
      previewRequestIdRef.current += 1;
      setLocalCommonConfig(addResult.updatedConfig);
      window.setTimeout(() => {
        isUpdatingFromCommonConfigRef.current = false;
      }, 0);
    }
  };

  const handleExtractCommonConfig = async () => {
    setIsExtractingCommonConfig(true);
    setCommonConfigError('');
    try {
      const response = await api.configCenter.providers.extractCommonConfigSnippet('claude', { settingsConfig: localCommonConfig });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const snippet = typeof payload.data?.snippet === 'string' ? payload.data.snippet : '{}';
      if (!snippet || snippet === '{}') {
        setCommonConfigError(t('configCenter.form.extractNoCommonConfig'));
        return;
      }
      const validationError = validateJsonConfig(snippet, '提取的配置');
      if (validationError) {
        setCommonConfigError(validationError);
        return;
      }
      setCommonConfigSnippet(snippet);
      await api.configCenter.providers.setCommonConfigSnippet('claude', snippet);
    } catch (err) {
      setCommonConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExtractingCommonConfig(false);
    }
  };

  const handleToggleConfigField = (field: string, checked: boolean) => {
    try {
      const config = JSON.parse(localCommonConfig || '{}');
      switch (field) {
        case 'hideAttribution':
          if (checked) {
            config.attribution = { commit: '', pr: '' };
          } else {
            delete config.attribution;
          }
          break;
        case 'teammates':
          if (!config.env) config.env = {};
          if (checked) {
            config.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
          } else {
            delete config.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
            if (Object.keys(config.env).length === 0) delete config.env;
          }
          break;
        case 'enableToolSearch':
          if (!config.env) config.env = {};
          if (checked) {
            config.env.ENABLE_TOOL_SEARCH = 'true';
          } else {
            delete config.env.ENABLE_TOOL_SEARCH;
            if (Object.keys(config.env).length === 0) delete config.env;
          }
          break;
        case 'effortMax':
          if (!config.env) config.env = {};
          if (checked) {
            config.env.CLAUDE_CODE_EFFORT_LEVEL = 'max';
          } else {
            delete config.env.CLAUDE_CODE_EFFORT_LEVEL;
            if (Object.keys(config.env).length === 0) delete config.env;
          }
          break;
        case 'disableAutoUpgrade':
          if (!config.env) config.env = {};
          if (checked) {
            config.env.DISABLE_AUTOUPDATER = '1';
          } else {
            delete config.env.DISABLE_AUTOUPDATER;
            if (Object.keys(config.env).length === 0) delete config.env;
          }
          break;
      }
      hasEditedCommonConfigRef.current = true;
      previewRequestIdRef.current += 1;
      const nextConfig = JSON.stringify(config, null, 2);
      setLocalCommonConfig(nextConfig);
      setUseCommonConfig(hasCommonConfigSnippet(nextConfig, commonConfigSnippet));
      setValues((current) => {
        const nextValues = applyClaudeSettingsConfigToFormValues(current, config);
        valuesRef.current = nextValues;
        return nextValues;
      });
    } catch {
      // Don't modify if JSON is invalid
    }
  };

  const getToggleState = (field: string): boolean => {
    try {
      const config = JSON.parse(localCommonConfig || '{}');
      switch (field) {
        case 'hideAttribution':
          return config?.attribution?.commit === '' && config?.attribution?.pr === '';
        case 'teammates':
          return config?.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1' || config?.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === 1;
        case 'enableToolSearch':
          return config?.env?.ENABLE_TOOL_SEARCH === 'true' || config?.env?.ENABLE_TOOL_SEARCH === '1';
        case 'effortMax':
          return config?.env?.CLAUDE_CODE_EFFORT_LEVEL === 'max';
        case 'disableAutoUpgrade':
          return config?.env?.DISABLE_AUTOUPDATER === '1' || config?.env?.DISABLE_AUTOUPDATER === 1;
        default:
          return false;
      }
    } catch {
      return false;
    }
  };

  const handleFormatCommonConfig = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(localCommonConfig || '{}'), null, 2);
      hasEditedCommonConfigRef.current = true;
      previewRequestIdRef.current += 1;
      setLocalCommonConfig(formatted);
      setUseCommonConfig(hasCommonConfigSnippet(formatted, commonConfigSnippet));
      setValues((current) => {
        const nextValues = applyClaudeSettingsConfigToFormValues(current, JSON.parse(formatted));
        valuesRef.current = nextValues;
        return nextValues;
      });
    } catch {
      // Don't format if invalid
    }
  };

  const fetchModels = async () => {
    if (!values.baseUrl.trim() || !values.apiKey.trim()) {
      setError(t('configCenter.form.errors.modelFetchMissingInput'));
      setModelFetchMessage(null);
      return;
    }
    const requestId = modelFetchRequestIdRef.current + 1;
    modelFetchRequestIdRef.current = requestId;
    const requestValues = {
      baseUrl: values.baseUrl,
      apiKey: values.apiKey,
      apiKeyField: values.apiKeyField,
      apiFormat: values.apiFormat,
      isFullUrl: values.isFullUrl,
    };

    setIsFetchingModels(true);
    setError(null);
    try {
      const response = await api.configCenter.providers.fetchClaudeModels(requestValues);
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const currentValues = valuesRef.current;
      if (
        modelFetchRequestIdRef.current !== requestId ||
        currentValues.baseUrl !== requestValues.baseUrl ||
        currentValues.apiKey !== requestValues.apiKey ||
        currentValues.isFullUrl !== requestValues.isFullUrl
      ) {
        return;
      }
      const models = extractModelNames(payload);
      setAvailableModels(models);
      setModelFetchMessage(
        models.length > 0
          ? t('configCenter.form.modelFetchSuccess', { count: models.length })
          : t('configCenter.form.modelFetchEmpty'),
      );
    } catch (err) {
      if (modelFetchRequestIdRef.current !== requestId) return;
      setModelFetchMessage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (modelFetchRequestIdRef.current === requestId) {
        setIsFetchingModels(false);
      }
    }
  };

  const speedTest = async () => {
    const endpointsSnapshot = endpointsForTest;
    if (!endpointsSnapshot.length) {
      setSpeedTestMessage(t('configCenter.form.speedTestNoEndpoints'));
      return;
    }
    const requestId = speedTestRequestIdRef.current + 1;
    speedTestRequestIdRef.current = requestId;

    const isCurrentSpeedTest = () => (
      speedTestRequestIdRef.current === requestId &&
      endpointListsEqual(
        normalizeEndpointList([valuesRef.current.baseUrl, ...valuesRef.current.customEndpoints]),
        endpointsSnapshot,
      )
    );

    setIsTestingEndpoints(true);
    setError(null);
    setSpeedTestMessage(null);
    try {
      const response = await api.configCenter.providers.speedTestClaudeEndpoints({
        urls: endpointsSnapshot,
        timeoutSecs: 10,
        apiKey: valuesRef.current.apiKey,
        apiKeyField: valuesRef.current.apiKeyField,
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      if (!isCurrentSpeedTest()) return;
      const results = extractSpeedResults(payload);
      setSpeedResults(results);
      setSpeedTestMessage(
        results.some((result) => result.ok)
          ? t('configCenter.form.speedTestSuccess')
          : t('configCenter.form.speedTestNoSuccess'),
      );
    } catch (err) {
      if (!isCurrentSpeedTest()) return;
      setSpeedTestMessage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrentSpeedTest()) {
        setIsTestingEndpoints(false);
      }
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!values.id.trim()) {
      setError(t('configCenter.form.errors.idRequired'));
      return;
    }
    if (!values.name.trim()) {
      setError(t('configCenter.form.errors.nameRequired'));
      return;
    }

    const configError = validateJsonConfig(localCommonConfig, t('configCenter.form.configJson'));
    if (configError) {
      setError(configError);
      return;
    }

    const editedConfig = JSON.parse(localCommonConfig || '{}');
    const providerConfig = buildClaudeSettingsConfig({
      ...values,
      baseUrl: values.baseUrl.trim(),
      customEndpoints: normalizeEndpointList(values.customEndpoints),
    });

    await onSubmit({
      ...values,
      id: values.id.trim(),
      name: values.name.trim(),
      websiteUrl: values.websiteUrl.trim(),
      baseUrl: values.baseUrl.trim(),
      customEndpoints: normalizeEndpointList(values.customEndpoints),
      commonConfigEnabled: useCommonConfig,
      settingsConfigOverride: {
        ...editedConfig,
        ...providerConfig,
        env: {
          ...((editedConfig.env && typeof editedConfig.env === 'object' && !Array.isArray(editedConfig.env)) ? editedConfig.env : {}),
          ...((providerConfig.env && typeof providerConfig.env === 'object' && !Array.isArray(providerConfig.env)) ? providerConfig.env : {}),
        },
      },
    });
  };

  const renderModelPicker = (field: ModelFieldKey) => {
    if (openModelPicker !== field) return null;
    return (
      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-lg">
        {availableModels.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground">{t('configCenter.form.noFetchedModels')}</div>
        ) : availableModels.map((model) => (
          <button
            key={model}
            type="button"
            className="block w-full rounded px-3 py-2 text-left hover:bg-muted"
            onClick={() => selectFetchedModel(field, model)}
          >
            {model}
          </button>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
        <DialogTitle>{isEditing ? t('configCenter.form.editTitle') : t('configCenter.form.addTitle')}</DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{isEditing ? t('configCenter.form.editTitle') : t('configCenter.form.addTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('configCenter.form.description')}
            </p>
          </div>

          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              {t('configCenter.form.providerId')}
              <Input value={values.id} onChange={(event) => updateValue('id', event.target.value)} disabled={isEditing} placeholder="my-provider" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t('configCenter.form.providerName')}
              <Input value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder={t('configCenter.form.providerNamePlaceholder')} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t('configCenter.form.websiteUrl')}
              <Input value={values.websiteUrl} onChange={(event) => updateValue('websiteUrl', event.target.value)} placeholder="https://console.example.com" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t('configCenter.form.notes')}
              <Input value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} placeholder={t('configCenter.form.optionalNotes')} />
            </label>
          </div>

          <label className="space-y-1.5 text-sm font-medium">
            <span className="flex items-center justify-between gap-3">
              <span>{t('configCenter.form.apiKey')}</span>
              {values.websiteUrl && (
                <a className="text-xs font-medium text-primary hover:underline" href={values.websiteUrl} target="_blank" rel="noreferrer">
                  {t('configCenter.form.getApiKey')}
                </a>
              )}
            </span>
            <div className="flex gap-2">
              <Input
                value={values.apiKey}
                onChange={(event) => updateValue('apiKey', event.target.value)}
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
              />
              <Button type="button" variant="outline" onClick={() => setShowApiKey((current) => !current)} aria-label={showApiKey ? 'Hide API key' : 'Show API key'}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </label>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="space-y-1.5 text-sm font-medium">
                {t('configCenter.form.requestUrl')}
                <Input value={values.baseUrl} onChange={(event) => updateValue('baseUrl', event.target.value)} placeholder="https://api.example.com" />
              </label>
              <label className="mt-7 flex items-center gap-2 text-sm font-medium">
                <input className={checkboxClassName} type="checkbox" checked={values.isFullUrl} onChange={(event) => updateValue('isFullUrl', event.target.checked)} />
                {t('configCenter.form.isFullUrl')}
              </label>
            </div>
            <div className="rounded-md border border-yellow-300/60 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-600/50 dark:bg-yellow-900/20 dark:text-yellow-200">
              {t('configCenter.form.requestUrlHint')}
            </div>
          </div>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('configCenter.form.advancedOptions')}</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                {t('configCenter.form.apiFormat')}
                <select className={selectClassName} value={values.apiFormat} onChange={(event) => updateValue('apiFormat', event.target.value as ClaudeApiFormat)}>
                  {apiFormatOptions.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                {t('configCenter.form.authField')}
                <select className={selectClassName} value={values.apiKeyField} onChange={(event) => updateValue('apiKeyField', event.target.value as ClaudeApiKeyField)}>
                  {apiKeyFieldOptions.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </label>
            </div>
            {values.apiFormat !== 'anthropic' && (
              <p className="mt-3 text-xs text-muted-foreground">{t('configCenter.form.apiFormatCompatibilityHint')}</p>
            )}
          </details>

          <section className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{t('configCenter.form.modelMapping')}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t('configCenter.form.modelMappingHint')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setValues((current) => {
                  const nextValues = applyOneClickModelMapping(current);
                  valuesRef.current = nextValues;
                  return nextValues;
                })}>{t('configCenter.form.quickSet')}</Button>
                <Button type="button" variant="outline" onClick={fetchModels} disabled={isFetchingModels}>
                  {isFetchingModels && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isFetchingModels ? t('configCenter.form.fetchingModels') : t('configCenter.form.fetchModels')}
                </Button>
              </div>
            </div>
            {modelFetchMessage && <div className="text-xs text-muted-foreground">{modelFetchMessage}</div>}

            <label className="block space-y-1.5 text-sm font-medium">
              {t('configCenter.form.defaultModel')}
              <div ref={openModelPicker === 'defaultModel' ? modelPickerRef : undefined} className="relative flex gap-2">
                <Input value={values.defaultModel} onChange={(event) => updateValue('defaultModel', event.target.value)} placeholder="claude-sonnet-4-5" />
                <Button type="button" variant="outline" onClick={() => setOpenModelPicker((current) => current === 'defaultModel' ? null : 'defaultModel')}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                {renderModelPicker('defaultModel')}
              </div>
            </label>

            <div className="grid gap-2 text-xs font-medium text-muted-foreground md:grid-cols-[8rem_1fr_1fr_5rem]">
              <div>{t('configCenter.form.modelRole')}</div>
              <div>{t('configCenter.form.displayName')}</div>
              <div>{t('configCenter.form.requestModel')}</div>
              <div>{t('configCenter.form.oneM')}</div>
            </div>
            {modelRows.map((row) => (
              <div key={row.role} className="grid gap-2 md:grid-cols-[8rem_1fr_1fr_5rem] md:items-center">
                <div className="text-sm font-medium">{t(row.labelKey)}</div>
                <Input value={values[row.displayNameKey]} onChange={(event) => updateValue(row.displayNameKey, event.target.value)} placeholder={t('configCenter.form.displayName')} />
                <div ref={openModelPicker === row.modelKey ? modelPickerRef : undefined} className="relative flex gap-2">
                  <Input value={values[row.modelKey]} onChange={(event) => updateValue(row.modelKey, event.target.value)} placeholder={t('configCenter.form.requestModel')} />
                  <Button type="button" variant="outline" onClick={() => setOpenModelPicker((current) => current === row.modelKey ? null : row.modelKey)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {renderModelPicker(row.modelKey)}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  {row.oneMKey === 'sonnetOneM' ? (
                    <>
                      <input className={checkboxClassName} type="checkbox" checked={values.sonnetOneM} onChange={(event) => updateValue('sonnetOneM', event.target.checked)} />
                      <span className="md:hidden">{t('configCenter.form.oneM')}</span>
                    </>
                  ) : row.oneMKey === 'opusOneM' ? (
                    <>
                      <input className={checkboxClassName} type="checkbox" checked={values.opusOneM} onChange={(event) => updateValue('opusOneM', event.target.checked)} />
                      <span className="md:hidden">{t('configCenter.form.oneM')}</span>
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </label>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">{t('configCenter.form.endpointManagement')}</h4>
              <Button type="button" variant="outline" onClick={speedTest} disabled={isTestingEndpoints || endpointsForTest.length === 0}>
                {isTestingEndpoints && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isTestingEndpoints ? t('configCenter.form.testingEndpoints') : t('configCenter.form.speedTest')}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input value={endpointInput} onChange={(event) => setEndpointInput(event.target.value)} placeholder="https://api-backup.example.com" />
              <Button type="button" variant="outline" onClick={addEndpoint} disabled={!endpointInput.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                {t('configCenter.form.addEndpoint')}
              </Button>
            </div>
            {values.customEndpoints.length > 0 && (
              <div className="space-y-2">
                {values.customEndpoints.map((endpoint) => (
                  <div key={endpoint} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="break-all">{endpoint}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeEndpoint(endpoint)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('configCenter.form.remove')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {speedTestMessage && <div className="text-xs text-muted-foreground">{speedTestMessage}</div>}
            {speedResults.length > 0 && (
              <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
                {speedResults.map((result) => (
                  <div key={result.endpoint} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all">{result.endpoint}</span>
                    <span className={result.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>
                      {result.ok
                        ? `${result.latencyMs ?? '-'} ms`
                        : `${result.error || 'Failed'}`}
                    </span>
                  </div>
                ))}
                {fastestSuccessfulEndpoint && (
                  <Button type="button" size="sm" variant="outline" onClick={() => updateValue('baseUrl', fastestSuccessfulEndpoint.endpoint)}>
                    {t('configCenter.form.useFastestEndpoint')}
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">{t('configCenter.form.configJson')}</h4>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCommonConfig}
                    onChange={(e) => toggleCommonConfig(e.target.checked)}
                    className="h-4 w-4"
                    disabled={isCommonConfigLoading}
                  />
                  {t('configCenter.form.writeCommonConfig')}
                </label>
                {isPreviewLoading && <span className="text-xs text-muted-foreground">{t('configCenter.form.previewLoading')}</span>}
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsCommonConfigModalOpen(true)}
                className="text-xs text-primary hover:underline"
              >
                {t('configCenter.form.editCommonConfig')}
              </button>
            </div>
            {commonConfigError && !isCommonConfigModalOpen && <p className="text-right text-xs text-destructive">{commonConfigError}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={getToggleState('hideAttribution')} onChange={(e) => handleToggleConfigField('hideAttribution', e.target.checked)} className="h-4 w-4" />
                {t('configCenter.form.hideAttribution')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={getToggleState('teammates')} onChange={(e) => handleToggleConfigField('teammates', e.target.checked)} className="h-4 w-4" />
                {t('configCenter.form.enableTeammates')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={getToggleState('enableToolSearch')} onChange={(e) => handleToggleConfigField('enableToolSearch', e.target.checked)} className="h-4 w-4" />
                {t('configCenter.form.enableToolSearch')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={getToggleState('effortMax')} onChange={(e) => handleToggleConfigField('effortMax', e.target.checked)} className="h-4 w-4" />
                {t('configCenter.form.effortMax')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={getToggleState('disableAutoUpgrade')} onChange={(e) => handleToggleConfigField('disableAutoUpgrade', e.target.checked)} className="h-4 w-4" />
                {t('configCenter.form.disableAutoUpgrade')}
              </label>
            </div>
            {previewError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{previewError}</div>}
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[160px] max-h-64 resize-y"
              value={localCommonConfig}
              onChange={(e) => {
                const nextConfig = e.target.value;
                hasEditedCommonConfigRef.current = true;
                previewRequestIdRef.current += 1;
                setLocalCommonConfig(nextConfig);
                setUseCommonConfig(hasCommonConfigSnippet(nextConfig, commonConfigSnippet));
                try {
                  const parsedConfig = JSON.parse(nextConfig || '{}');
                  if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
                    setValues((current) => {
                      const nextValues = applyClaudeSettingsConfigToFormValues(current, parsedConfig);
                      valuesRef.current = nextValues;
                      return nextValues;
                    });
                  }
                } catch {
                  // Keep editing invalid JSON without syncing form fields.
                }
              }}
              placeholder={'{\n  "env": {\n    "ANTHROPIC_BASE_URL": "https://..."\n  }\n}'}
            />
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={handleFormatCommonConfig} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                {t('configCenter.form.formatCommonConfig')}
              </Button>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>{t('configCenter.form.cancel')}</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? t('configCenter.form.saving') : t('configCenter.form.save')}</Button>
          </div>
        </form>

        {isCommonConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-background shadow-lg">
              <div className="flex items-center justify-between border-b border-border p-4">
                <DialogTitle>{t('configCenter.form.editCommonConfigTitle')}</DialogTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCommonConfigModalOpen(false)}>
                  {t('configCenter.form.cancel')}
                </Button>
              </div>
              <div className="space-y-4 overflow-y-auto p-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                  <p className="font-medium">{t('configCenter.form.commonConfigGuideTitle')}</p>
                  <p>{t('configCenter.form.commonConfigGuidePurpose')}</p>
                  <p>{t('configCenter.form.commonConfigGuideUsage')}</p>
                  <p className="text-muted-foreground">{t('configCenter.form.commonConfigGuideReassurance')}</p>
                </div>
                <textarea
                  className="min-h-[320px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={commonConfigSnippet}
                  onChange={(event) => handleCommonConfigSnippetChange(event.target.value)}
                  placeholder={'{\n  "includeCoAuthoredBy": false\n}'}
                />
                {commonConfigError && <p className="text-sm text-destructive">{commonConfigError}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-border p-4">
                <Button type="button" variant="outline" onClick={handleExtractCommonConfig} disabled={isExtractingCommonConfig}>
                  {isExtractingCommonConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('configCenter.form.extractFromCurrent')}
                </Button>
                <Button type="button" onClick={() => setIsCommonConfigModalOpen(false)}>{t('configCenter.form.saveCommonConfig')}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
