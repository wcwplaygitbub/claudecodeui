import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';
import type {
  ApiResponse,
  McpFormState,
  ProviderMcpServer,
  UnifiedMcpApp,
  UnifiedMcpAppStates,
  UnifiedMcpServer,
  UnifiedMcpServerFormValue,
} from '../types';
import { createMcpPayloadFromForm, getErrorMessage } from '../utils/mcpFormatting';

const UNIFIED_MCP_DEFAULT_ENABLED: UnifiedMcpAppStates = {
  claude: true,
  codex: false,
};

const readJson = async <T,>(response: Response): Promise<T> => response.json() as Promise<T>;

const getApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;

  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

const isUnifiedFormValue = (value: ProviderMcpServer | null): value is UnifiedMcpServerFormValue =>
  Boolean(value && 'id' in value && 'enabled' in value);

const formToPayload = (formData: McpFormState, enabled: UnifiedMcpAppStates) => {
  const providerPayload = createMcpPayloadFromForm('claude', formData, {
    supportedTransports: ['stdio', 'http', 'sse'],
    supportsWorkingDirectory: true,
    includeProviderSpecificFields: true,
  });

  return {
    name: providerPayload.name,
    transport: providerPayload.transport,
    command: providerPayload.command,
    args: providerPayload.args,
    env: providerPayload.env,
    cwd: providerPayload.cwd,
    url: providerPayload.url,
    headers: providerPayload.headers,
    envVars: providerPayload.envVars,
    bearerTokenEnvVar: providerPayload.bearerTokenEnvVar,
    envHttpHeaders: providerPayload.envHttpHeaders,
    enabled,
  };
};

export const unifiedServerToFormValue = (server: UnifiedMcpServer): UnifiedMcpServerFormValue => ({
  id: server.id,
  provider: 'claude',
  name: server.name,
  scope: 'user',
  transport: server.serverConfig.transport,
  command: server.serverConfig.command,
  args: server.serverConfig.args ?? [],
  env: server.serverConfig.env ?? {},
  cwd: server.serverConfig.cwd,
  url: server.serverConfig.url,
  headers: server.serverConfig.headers ?? {},
  envVars: server.serverConfig.envVars ?? [],
  bearerTokenEnvVar: server.serverConfig.bearerTokenEnvVar,
  envHttpHeaders: server.serverConfig.envHttpHeaders ?? {},
  enabled: server.enabled,
});

export function useUnifiedMcpServers() {
  const [servers, setServers] = useState<UnifiedMcpServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<UnifiedMcpServer | null>(null);

  const refreshServers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await authenticatedFetch('/api/unified-mcp/servers');
      const data = await readJson<ApiResponse<{ servers: UnifiedMcpServer[] }>>(response);
      if (!response.ok || !data.success) {
        throw new Error(getApiErrorMessage(data, 'Failed to load MCP servers'));
      }
      setServers(data.data.servers);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openForm = useCallback((server?: UnifiedMcpServer) => {
    setEditingServer(server ?? null);
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setEditingServer(null);
    setIsFormOpen(false);
  }, []);

  const submitForm = useCallback(async (formData: McpFormState, serverBeingEdited: ProviderMcpServer | null) => {
    const unifiedServer = isUnifiedFormValue(serverBeingEdited) ? serverBeingEdited : null;
    const enabled = unifiedServer?.enabled ?? UNIFIED_MCP_DEFAULT_ENABLED;
    const payload = formToPayload(formData, enabled);
    const targetUrl = unifiedServer
      ? `/api/unified-mcp/servers/${encodeURIComponent(unifiedServer.id)}`
      : '/api/unified-mcp/servers';
    const response = await authenticatedFetch(targetUrl, {
      method: unifiedServer ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    const data = await readJson<ApiResponse<{ server: UnifiedMcpServer }>>(response);
    if (!response.ok || !data.success) {
      throw new Error(getApiErrorMessage(data, 'Failed to save MCP server'));
    }
    await refreshServers();
    setSaveStatus('success');
    closeForm();
  }, [closeForm, refreshServers]);

  const deleteServer = useCallback(async (server: UnifiedMcpServer) => {
    const confirmed = window.confirm(
      `确认删除 MCP Server「${server.name}」？\n\n将删除统一管理记录，并从当前开启的应用中移除对应 MCP 配置。`,
    );
    if (!confirmed) return;

    const response = await authenticatedFetch(`/api/unified-mcp/servers/${encodeURIComponent(server.id)}`, {
      method: 'DELETE',
    });
    const data = await readJson<ApiResponse<{ deleted: boolean }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to delete MCP server'));
    }
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const toggleApp = useCallback(async (server: UnifiedMcpServer, app: UnifiedMcpApp, enabled: boolean) => {
    const response = await authenticatedFetch(`/api/unified-mcp/servers/${encodeURIComponent(server.id)}/apps/${app}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    const data = await readJson<ApiResponse<{ server: UnifiedMcpServer }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to update MCP server'));
    }
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const importFromProviders = useCallback(async () => {
    const response = await authenticatedFetch('/api/unified-mcp/import', { method: 'POST' });
    const data = await readJson<ApiResponse<{ imported: number; servers: UnifiedMcpServer[] }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to import MCP servers'));
    }
    setServers(data.data.servers);
    setSaveStatus('success');
  }, []);

  useEffect(() => {
    void refreshServers();
  }, [refreshServers]);

  useEffect(() => {
    if (saveStatus === null) return;
    const timer = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  return {
    servers,
    isLoading,
    loadError,
    saveStatus,
    isFormOpen,
    editingServer,
    openForm,
    closeForm,
    submitForm,
    deleteServer,
    toggleApp,
    importFromProviders,
  };
}
