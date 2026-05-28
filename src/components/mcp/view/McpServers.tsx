import { Download, Edit3, Globe, Plus, Server, Terminal, Trash2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { McpProject, McpScope, UnifiedMcpApp, UnifiedMcpServer } from '../types';
import { Badge, Button } from '../../../shared/view/ui';
import { cn } from '../../../lib/utils';
import { useUnifiedMcpServers, unifiedServerToFormValue } from '../hooks/useUnifiedMcpServers';
import { maskSecret } from '../utils/mcpFormatting';

import McpServerFormModal from './modals/McpServerFormModal';

type McpServersProps = {
  currentProjects?: McpProject[];
};

const UNIFIED_MCP_APPS: Array<{ id: UnifiedMcpApp; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'cursor', label: 'Cursor' },
];

const getTransportIcon = (transport: string | undefined) => {
  if (transport === 'stdio') return <Terminal className="h-4 w-4" />;
  if (transport === 'sse') return <Zap className="h-4 w-4" />;
  if (transport === 'http') return <Globe className="h-4 w-4" />;
  return <Server className="h-4 w-4" />;
};

const getScopeLabel = (scope: McpScope): string => {
  if (scope === 'user') return 'user';
  if (scope === 'local') return 'local';
  return 'project';
};

function ConfigLine({ label, children }: { label: string; children: string }) {
  if (!children) return null;

  return (
    <div>
      {label}:{' '}
      <code className="rounded bg-muted px-1 text-xs">{children}</code>
    </div>
  );
}

const getConfig = (server: UnifiedMcpServer) => server.serverConfig;

export default function McpServers({ currentProjects = [] }: McpServersProps) {
  const { t } = useTranslation('settings');
  const {
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
  } = useUnifiedMcpServers();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Server className="h-5 w-5 text-purple-500" />
        <h3 className="text-lg font-medium text-foreground">{t('mcpServers.title')}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Unified MCP management follows cc-switch: define each server once and enable it for Claude, Codex, Gemini, or Cursor.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => openForm()} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add MCP Server
          </Button>
          <Button onClick={importFromProviders} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Import from apps
          </Button>
        </div>
        <div className="min-h-4">
          {saveStatus === 'success' && (
            <span className="animate-in fade-in text-xs text-muted-foreground">{t('saveStatus.success')}</span>
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
          {loadError}
        </div>
      )}

      <div className="space-y-2">
        {isLoading && servers.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">Loading MCP servers...</div>
        )}

        {servers.map((server) => {
          const config = getConfig(server);
          return (
            <div key={server.id} className="rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {getTransportIcon(config.transport)}
                    <span className="font-medium text-foreground">{server.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {config.transport || 'stdio'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getScopeLabel('user')}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <ConfigLine label={t('mcpServers.config.command')}>{config.command || ''}</ConfigLine>
                    <ConfigLine label={t('mcpServers.config.url')}>{config.url || ''}</ConfigLine>
                    <ConfigLine label={t('mcpServers.config.args')}>{(config.args || []).join(' ')}</ConfigLine>
                    <ConfigLine label="Cwd">{config.cwd || ''}</ConfigLine>
                    {config.env && Object.keys(config.env).length > 0 && (
                      <ConfigLine label={t('mcpServers.config.environment')}>
                        {Object.entries(config.env).map(([key, value]) => `${key}=${maskSecret(value)}`).join(', ')}
                      </ConfigLine>
                    )}
                    {config.envVars && config.envVars.length > 0 && (
                      <ConfigLine label="Env Vars">{config.envVars.join(', ')}</ConfigLine>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {UNIFIED_MCP_APPS.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => void toggleApp(server, app.id, !server.enabled[app.id])}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs transition-colors',
                          server.enabled[app.id]
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {app.label}: {server.enabled[app.id] ? '开' : '关'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  <Button
                    onClick={() => openForm(server)}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    title={t('mcpServers.actions.edit')}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => void deleteServer(server)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    title={t('mcpServers.actions.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {!isLoading && servers.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">{t('mcpServers.empty')}</div>
        )}
      </div>

      <McpServerFormModal
        provider="claude"
        isOpen={isFormOpen}
        editingServer={editingServer ? unifiedServerToFormValue(editingServer) : null}
        currentProjects={currentProjects}
        title={editingServer ? undefined : 'Add MCP Server'}
        submitLabel="Save MCP Server"
        supportedScopes={['user']}
        supportedTransports={['stdio', 'http', 'sse']}
        onClose={closeForm}
        onSubmit={submitForm}
      />
    </div>
  );
}
