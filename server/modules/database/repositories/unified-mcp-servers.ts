import { getConnection } from '@/modules/database/connection.js';
import type { SaveUnifiedMcpServerInput, UnifiedMcpServer, UnifiedMcpServerConfig } from '@/modules/unified-mcp/index.js';

export type UnifiedMcpServerRow = {
  id: string;
  name: string;
  server_config: string;
  description: string | null;
  tags: string;
  enabled_claude: number;
  enabled_codex: number;
  enabled_gemini: number;
  enabled_cursor: number;
  created_at: string;
  updated_at: string;
};

const parseTags = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

const parseServerConfig = (value: string): UnifiedMcpServerConfig => {
  const parsed = JSON.parse(value) as UnifiedMcpServerConfig;
  return parsed;
};

const mapRow = (row: UnifiedMcpServerRow): UnifiedMcpServer => ({
  id: row.id,
  name: row.name,
  description: row.description,
  tags: parseTags(row.tags),
  serverConfig: parseServerConfig(row.server_config),
  enabled: {
    claude: row.enabled_claude === 1,
    codex: row.enabled_codex === 1,
    gemini: row.enabled_gemini === 1,
    cursor: row.enabled_cursor === 1,
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const unifiedMcpServersDb = {
  list(): UnifiedMcpServer[] {
    const db = getConnection();
    const rows = db
      .prepare('SELECT * FROM unified_mcp_servers ORDER BY name COLLATE NOCASE ASC')
      .all() as UnifiedMcpServerRow[];
    return rows.map(mapRow);
  },

  get(id: string): UnifiedMcpServer | null {
    const db = getConnection();
    const row = db
      .prepare('SELECT * FROM unified_mcp_servers WHERE id = ?')
      .get(id) as UnifiedMcpServerRow | undefined;
    return row ? mapRow(row) : null;
  },

  save(input: SaveUnifiedMcpServerInput): UnifiedMcpServer {
    const db = getConnection();
    db.prepare(
      `INSERT INTO unified_mcp_servers (
        id, name, server_config, description, tags,
        enabled_claude, enabled_codex, enabled_gemini, enabled_cursor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        server_config = excluded.server_config,
        description = excluded.description,
        tags = excluded.tags,
        enabled_claude = excluded.enabled_claude,
        enabled_codex = excluded.enabled_codex,
        enabled_gemini = excluded.enabled_gemini,
        enabled_cursor = excluded.enabled_cursor,
        updated_at = CURRENT_TIMESTAMP`,
    ).run(
      input.id,
      input.name,
      JSON.stringify(input.serverConfig),
      input.description ?? null,
      JSON.stringify(input.tags ?? []),
      input.enabled.claude ? 1 : 0,
      input.enabled.codex ? 1 : 0,
      input.enabled.gemini ? 1 : 0,
      input.enabled.cursor ? 1 : 0,
    );

    const saved = unifiedMcpServersDb.get(input.id);
    if (!saved) {
      throw new Error('Failed to save unified MCP server');
    }
    return saved;
  },

  delete(id: string): boolean {
    const db = getConnection();
    const result = db.prepare('DELETE FROM unified_mcp_servers WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
