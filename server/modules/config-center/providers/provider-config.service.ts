import { ClaudeProviderAdapter } from '@/modules/config-center/adapters/claude/claude-provider.adapter.js';
import type { ConfigCenterAppType } from '@/modules/config-center/providers/provider-config.validators.js';
import { configProvidersDb, type ConfigProvider, type SaveConfigProviderInput } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';

const adapters = {
  claude: new ClaudeProviderAdapter(),
} satisfies Record<ConfigCenterAppType, ClaudeProviderAdapter>;

type ProviderPayload = Omit<SaveConfigProviderInput, 'appType'>;

const ensureProviderExists = (provider: ConfigProvider | null, appType: ConfigCenterAppType, id: string): ConfigProvider => {
  if (!provider) {
    throw new AppError(`Provider "${id}" was not found for ${appType}.`, {
      code: 'CONFIG_PROVIDER_NOT_FOUND',
      statusCode: 404,
    });
  }
  return provider;
};

const rejectCurrentProviderDelete = (provider: ConfigProvider): void => {
  if (provider.isCurrent) {
    throw new AppError('Current provider cannot be deleted. Apply another provider before deleting this one.', {
      code: 'CANNOT_DELETE_CURRENT_PROVIDER',
      statusCode: 409,
    });
  }
};

export const providerConfigService = {
  list(appType: ConfigCenterAppType): ConfigProvider[] {
    return configProvidersDb.list(appType);
  },

  getCurrent(appType: ConfigCenterAppType): ConfigProvider | null {
    return configProvidersDb.getCurrent(appType);
  },

  create(appType: ConfigCenterAppType, payload: ProviderPayload): ConfigProvider {
    const provider = {
      ...payload,
      appType,
      category: payload.category ?? 'custom',
      websiteUrl: payload.websiteUrl ?? null,
      notes: payload.notes ?? null,
      icon: payload.icon ?? null,
      iconColor: payload.iconColor ?? null,
      meta: payload.meta ?? {},
    };

    adapters[appType].validateProvider({
      ...provider,
      isCurrent: false,
    } as ConfigProvider);

    return configProvidersDb.create(provider);
  },

  update(appType: ConfigCenterAppType, id: string, payload: Omit<ProviderPayload, 'id'>): ConfigProvider {
    ensureProviderExists(configProvidersDb.get(appType, id), appType, id);

    const provider = {
      id,
      appType,
      name: payload.name,
      settingsConfig: payload.settingsConfig,
      category: payload.category ?? 'custom',
      websiteUrl: payload.websiteUrl ?? null,
      notes: payload.notes ?? null,
      icon: payload.icon ?? null,
      iconColor: payload.iconColor ?? null,
      meta: payload.meta ?? {},
      isCurrent: false,
    } as ConfigProvider;
    adapters[appType].validateProvider(provider);

    return configProvidersDb.update(appType, id, payload);
  },

  delete(appType: ConfigCenterAppType, id: string): boolean {
    const provider = ensureProviderExists(configProvidersDb.get(appType, id), appType, id);
    rejectCurrentProviderDelete(provider);
    return configProvidersDb.delete(appType, id);
  },

  duplicate(appType: ConfigCenterAppType, id: string, nextId: string, nextName: string): ConfigProvider {
    const provider = ensureProviderExists(configProvidersDb.get(appType, id), appType, id);
    if (configProvidersDb.get(appType, nextId)) {
      throw new AppError(`Provider "${nextId}" already exists for ${appType}.`, {
        code: 'CONFIG_PROVIDER_ALREADY_EXISTS',
        statusCode: 409,
      });
    }

    return configProvidersDb.create({
      id: nextId,
      appType,
      name: nextName,
      settingsConfig: provider.settingsConfig,
      category: provider.category,
      websiteUrl: provider.websiteUrl,
      notes: provider.notes,
      icon: provider.icon,
      iconColor: provider.iconColor,
      meta: provider.meta,
    });
  },

  async apply(appType: ConfigCenterAppType, id: string) {
    const provider = ensureProviderExists(configProvidersDb.get(appType, id), appType, id);
    const result = await adapters[appType].applyProvider(provider);
    configProvidersDb.setCurrent(appType, id);
    return result;
  },

  async importCurrent(appType: ConfigCenterAppType, id: string, name: string): Promise<ConfigProvider> {
    if (configProvidersDb.get(appType, id)) {
      throw new AppError(`Provider "${id}" already exists for ${appType}.`, {
        code: 'CONFIG_PROVIDER_ALREADY_EXISTS',
        statusCode: 409,
      });
    }

    const settingsConfig = await adapters[appType].readCurrentConfig();
    if (!settingsConfig) {
      throw new AppError(`No ${appType} provider settings were found in the current CLI config.`, {
        code: 'CURRENT_PROVIDER_CONFIG_NOT_FOUND',
        statusCode: 404,
      });
    }

    const provider = configProvidersDb.create({
      id,
      appType,
      name,
      settingsConfig,
      category: 'imported',
      meta: {},
    });

    if (!configProvidersDb.getCurrent(appType)) {
      configProvidersDb.setCurrent(appType, provider.id);
      return ensureProviderExists(configProvidersDb.get(appType, provider.id), appType, provider.id);
    }

    return provider;
  },
};
