import crypto from 'node:crypto';

import { unifiedMcpServersDb } from '@/modules/database/index.js';
import { providerRegistry } from '@/modules/providers/index.js';
import type { LLMProvider, ProviderMcpServer, UpsertProviderMcpServerInput } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';
import type {
  SaveUnifiedMcpServerInput,
  UnifiedMcpApp,
  UnifiedMcpAppStates,
  UnifiedMcpServer,
  UnifiedMcpServerConfig,
} from './unified-mcp.types.js';
import { UNIFIED_MCP_APPS } from './unified-mcp.types.js';

const createId = (name: string): string => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || crypto.randomUUID();
};

const fingerprint = (config: UnifiedMcpServerConfig): string => crypto
  .createHash('sha256')
  .update(JSON.stringify(config))
  .digest('hex')
  .slice(0, 10);

const requireServer = (id: string): UnifiedMcpServer => {
  const server = unifiedMcpServersDb.get(id);
  if (!server) {
    throw new AppError('Unified MCP server not found.', {
      code: 'UNIFIED_MCP_SERVER_NOT_FOUND',
      statusCode: 404,
    });
  }
  return server;
};

const toProviderPayload = (server: UnifiedMcpServer): UpsertProviderMcpServerInput => ({
  name: server.name,
  scope: 'user',
  transport: server.serverConfig.transport,
  command: server.serverConfig.command,
  args: server.serverConfig.args,
  env: server.serverConfig.env,
  cwd: server.serverConfig.cwd,
  url: server.serverConfig.url,
  headers: server.serverConfig.headers,
  envVars: server.serverConfig.envVars,
  bearerTokenEnvVar: server.serverConfig.bearerTokenEnvVar,
  envHttpHeaders: server.serverConfig.envHttpHeaders,
});

const providerForApp = (app: UnifiedMcpApp) => providerRegistry.resolveProvider(app as LLMProvider);

const syncToApp = async (server: UnifiedMcpServer, app: UnifiedMcpApp): Promise<void> => {
  await providerForApp(app).mcp.upsertServer(toProviderPayload(server));
};

const removeFromApp = async (server: UnifiedMcpServer, app: UnifiedMcpApp): Promise<void> => {
  await providerForApp(app).mcp.removeServer({ name: server.name, scope: 'user' });
};

const syncEnabledApps = async (server: UnifiedMcpServer): Promise<void> => {
  for (const app of UNIFIED_MCP_APPS) {
    if (server.enabled[app]) {
      await syncToApp(server, app);
    }
  }
};

const providerServerToConfig = (server: ProviderMcpServer): UnifiedMcpServerConfig => ({
  transport: server.transport,
  command: server.command,
  args: server.args,
  env: server.env,
  cwd: server.cwd,
  url: server.url,
  headers: server.headers,
  envVars: server.envVars,
  bearerTokenEnvVar: server.bearerTokenEnvVar,
  envHttpHeaders: server.envHttpHeaders,
});

const sameConfig = (left: UnifiedMcpServerConfig, right: UnifiedMcpServerConfig): boolean => (
  JSON.stringify(left) === JSON.stringify(right)
);

const emptyEnabled = (): UnifiedMcpAppStates => ({
  claude: false,
  codex: false,
  gemini: false,
  cursor: false,
});

export const unifiedMcpService = {
  list(): UnifiedMcpServer[] {
    return unifiedMcpServersDb.list();
  },

  async create(input: Omit<SaveUnifiedMcpServerInput, 'id'>): Promise<UnifiedMcpServer> {
    const baseId = createId(input.name);
    const existing = unifiedMcpServersDb.get(baseId);
    const id = existing ? `${baseId}-${fingerprint(input.serverConfig)}` : baseId;
    const saved = unifiedMcpServersDb.save({ ...input, id });
    await syncEnabledApps(saved);
    return saved;
  },

  async update(id: string, input: Omit<SaveUnifiedMcpServerInput, 'id'>): Promise<UnifiedMcpServer> {
    const previous = requireServer(id);
    const saved = unifiedMcpServersDb.save({ ...input, id });

    for (const app of UNIFIED_MCP_APPS) {
      if (previous.enabled[app] && (!saved.enabled[app] || previous.name !== saved.name)) {
        await removeFromApp(previous, app);
      }
      if (saved.enabled[app]) {
        await syncToApp(saved, app);
      }
    }

    return saved;
  },

  async delete(id: string): Promise<{ deleted: boolean }> {
    const server = requireServer(id);
    for (const app of UNIFIED_MCP_APPS) {
      if (server.enabled[app]) {
        await removeFromApp(server, app);
      }
    }
    return { deleted: unifiedMcpServersDb.delete(id) };
  },

  async toggleApp(id: string, app: UnifiedMcpApp, enabled: boolean): Promise<UnifiedMcpServer> {
    const server = requireServer(id);
    const next = unifiedMcpServersDb.save({
      id: server.id,
      name: server.name,
      description: server.description,
      tags: server.tags,
      serverConfig: server.serverConfig,
      enabled: { ...server.enabled, [app]: enabled },
    });

    if (enabled) {
      await syncToApp(next, app);
    } else {
      await removeFromApp(server, app);
    }

    return next;
  },

  async importFromProviders(): Promise<{ imported: number; servers: UnifiedMcpServer[] }> {
    let imported = 0;

    for (const app of UNIFIED_MCP_APPS) {
      const provider = providerForApp(app);
      const providerServers = await provider.mcp.listServersForScope('user');

      for (const providerServer of providerServers) {
        const serverConfig = providerServerToConfig(providerServer);
        const baseId = createId(providerServer.name);
        const baseServer = unifiedMcpServersDb.get(baseId);
        const id = baseServer && !sameConfig(baseServer.serverConfig, serverConfig)
          ? `${baseId}-${app}`
          : baseId;
        const existing = unifiedMcpServersDb.get(id);

        unifiedMcpServersDb.save({
          id,
          name: providerServer.name,
          description: existing?.description ?? null,
          tags: existing?.tags ?? [],
          serverConfig: existing?.serverConfig ?? serverConfig,
          enabled: {
            ...(existing?.enabled ?? emptyEnabled()),
            [app]: true,
          },
        });

        if (!existing) {
          imported += 1;
        }
      }
    }

    return { imported, servers: unifiedMcpServersDb.list() };
  },
};
