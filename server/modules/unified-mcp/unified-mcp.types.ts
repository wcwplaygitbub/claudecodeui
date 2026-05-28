import type { McpTransport } from '@/shared/types.js';

export type UnifiedMcpApp = 'claude' | 'codex' | 'gemini' | 'cursor';

export const UNIFIED_MCP_APPS: UnifiedMcpApp[] = ['claude', 'codex', 'gemini', 'cursor'];

export type UnifiedMcpAppStates = Record<UnifiedMcpApp, boolean>;

export type UnifiedMcpServerConfig = {
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  envVars?: string[];
  bearerTokenEnvVar?: string;
  envHttpHeaders?: Record<string, string>;
};

export type UnifiedMcpServer = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  serverConfig: UnifiedMcpServerConfig;
  enabled: UnifiedMcpAppStates;
  createdAt: string;
  updatedAt: string;
};

export type SaveUnifiedMcpServerInput = {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  serverConfig: UnifiedMcpServerConfig;
  enabled: UnifiedMcpAppStates;
};
