# Unified MCP Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build cc-switch-style unified MCP management: one MCP server registry with per-agent enable switches, synced into Claude/Codex/Gemini/Cursor via existing provider MCP adapters.

**Architecture:** The unified MCP database is the source of truth. Existing provider-specific MCP readers/writers remain as adapters for import and sync only. The UI no longer treats MCP as selected-agent-owned data; it shows one unified list with Claude/Codex/Gemini/Cursor switches per server.

**Tech Stack:** TypeScript, Express routes, SQLite repositories, React hooks/components, existing provider MCP adapters, existing MCP form utilities.

---

## cc-switch Alignment Rules

- Follow cc-switch's unified MCP model, not the current selected-provider-first UI model.
- Store each MCP server once, with app enable flags.
- Sync app flags into each provider's real MCP config through provider adapters.
- Keep old provider MCP APIs for compatibility, but new UI uses unified MCP APIs.
- Milestone 1 covers MCP only. Skills are explicitly out of scope.
- First version supports unified `user` scope only. Existing provider/project/local APIs remain untouched.

---

## File Structure

### Backend files

- Create: `server/modules/database/repositories/unified-mcp-servers.ts`
  - Owns CRUD for unified MCP rows.
  - Serializes/deserializes `server_config` JSON.

- Modify: `server/modules/database/schema.ts`
  - Adds `unified_mcp_servers` table.

- Create: `server/modules/unified-mcp/unified-mcp.types.ts`
  - Defines DB/API types and app enable flags.

- Create: `server/modules/unified-mcp/unified-mcp.validators.ts`
  - Parses and validates request payloads.

- Create: `server/modules/unified-mcp/unified-mcp.service.ts`
  - Implements list/create/update/delete/toggle/import/sync behavior.
  - Calls `providerRegistry.resolveProvider(provider).mcp` for actual provider writes.

- Create: `server/modules/unified-mcp/unified-mcp.routes.ts`
  - Exposes `/api/unified-mcp/*` routes.

- Modify: `server/index.js`
  - Mounts unified MCP routes.

- Test: `server/modules/unified-mcp/unified-mcp.service.test.ts`
  - Tests create/toggle/delete/import merge behavior.

### Frontend files

- Modify: `src/components/mcp/types.ts`
  - Adds `UnifiedMcpServer`, `UnifiedMcpApp`, `UnifiedMcpAppStates`, `UnifiedMcpServerPayload`.

- Create: `src/components/mcp/hooks/useUnifiedMcpServers.ts`
  - Fetches unified MCP servers and exposes create/update/delete/toggle/import.

- Modify: `src/components/mcp/view/McpServers.tsx`
  - Renders unified list and app switches.
  - Removes selected-provider-owned list behavior.

- Modify: `src/components/mcp/view/modals/McpServerFormModal.tsx`
  - Reuses existing form for unified mode using supported user scope and stdio/http/sse config fields.

- Modify: `src/components/settings/view/tabs/agents-settings/sections/AgentCategoryContentSection.tsx`
  - Stops passing `selectedProvider` to MCP UI or leaves prop ignored depending on final component signature.

- Modify: `src/i18n/locales/*/settings.json`
  - Adds unified MCP labels if needed.

---

## Data Model

```ts
type UnifiedMcpApp = 'claude' | 'codex' | 'gemini' | 'cursor';

type UnifiedMcpAppStates = {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  cursor: boolean;
};

type UnifiedMcpServerConfig = {
  transport: 'stdio' | 'http' | 'sse';
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

type UnifiedMcpServer = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  serverConfig: UnifiedMcpServerConfig;
  enabled: UnifiedMcpAppStates;
  createdAt: number;
  updatedAt: number;
};
```

SQLite table:

```sql
CREATE TABLE IF NOT EXISTS unified_mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server_config TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  enabled_claude INTEGER NOT NULL DEFAULT 0,
  enabled_codex INTEGER NOT NULL DEFAULT 0,
  enabled_gemini INTEGER NOT NULL DEFAULT 0,
  enabled_cursor INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## Task 1: Add unified MCP database repository

**Files:**
- Modify: `server/modules/database/schema.ts`
- Create: `server/modules/database/repositories/unified-mcp-servers.ts`
- Create: `server/modules/unified-mcp/unified-mcp.types.ts`

- [ ] **Step 1: Write failing repository test**

Create `server/modules/unified-mcp/unified-mcp.repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { unifiedMcpServersRepository } from '@/modules/database/repositories/unified-mcp-servers.js';

describe('unifiedMcpServersRepository', () => {
  it('round-trips unified MCP server rows with per-app flags', () => {
    const now = 1710000000000;
    unifiedMcpServersRepository.upsert({
      id: 'context7',
      name: 'context7',
      description: null,
      tags: [],
      serverConfig: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
      enabled: {
        claude: true,
        codex: false,
        gemini: true,
        cursor: false,
      },
      createdAt: now,
      updatedAt: now,
    });

    const server = unifiedMcpServersRepository.getById('context7');

    expect(server).toMatchObject({
      id: 'context7',
      name: 'context7',
      serverConfig: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
      enabled: {
        claude: true,
        codex: false,
        gemini: true,
        cursor: false,
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.repository.test.ts
```

Expected: FAIL because `unified-mcp-servers.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `server/modules/unified-mcp/unified-mcp.types.ts`:

```ts
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
  createdAt: number;
  updatedAt: number;
};
```

- [ ] **Step 4: Add schema table**

In `server/modules/database/schema.ts`, add table creation next to existing MCP/provider tables:

```ts
conn.execute(
  `CREATE TABLE IF NOT EXISTS unified_mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    server_config TEXT NOT NULL,
    description TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    enabled_claude INTEGER NOT NULL DEFAULT 0,
    enabled_codex INTEGER NOT NULL DEFAULT 0,
    enabled_gemini INTEGER NOT NULL DEFAULT 0,
    enabled_cursor INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  [],
).map_err((e) => AppError::Database(e.to_string()))?;
```

If this file is TypeScript rather than Rust in the local branch, use the existing `appConfigDb`/SQLite helper style from nearby table definitions instead of Rust syntax. Keep the table shape identical.

- [ ] **Step 5: Implement repository**

Create `server/modules/database/repositories/unified-mcp-servers.ts`:

```ts
import { appConfigDb } from '@/modules/database/index.js';
import type { UnifiedMcpServer } from '@/modules/unified-mcp/unified-mcp.types.js';
import { AppError } from '@/shared/utils.js';

const parseJsonArray = (value: string): string[] => {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
};

const rowToServer = (row: Record<string, unknown>): UnifiedMcpServer => ({
  id: String(row.id),
  name: String(row.name),
  description: typeof row.description === 'string' ? row.description : null,
  tags: parseJsonArray(String(row.tags ?? '[]')),
  serverConfig: JSON.parse(String(row.server_config)) as UnifiedMcpServer['serverConfig'],
  enabled: {
    claude: Boolean(row.enabled_claude),
    codex: Boolean(row.enabled_codex),
    gemini: Boolean(row.enabled_gemini),
    cursor: Boolean(row.enabled_cursor),
  },
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

export const unifiedMcpServersRepository = {
  list(): UnifiedMcpServer[] {
    const rows = appConfigDb.prepare('SELECT * FROM unified_mcp_servers ORDER BY name COLLATE NOCASE').all() as Record<string, unknown>[];
    return rows.map(rowToServer);
  },

  getById(id: string): UnifiedMcpServer | null {
    const row = appConfigDb.prepare('SELECT * FROM unified_mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToServer(row) : null;
  },

  upsert(server: UnifiedMcpServer): void {
    appConfigDb.prepare(`
      INSERT INTO unified_mcp_servers (
        id, name, server_config, description, tags,
        enabled_claude, enabled_codex, enabled_gemini, enabled_cursor,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        server_config = excluded.server_config,
        description = excluded.description,
        tags = excluded.tags,
        enabled_claude = excluded.enabled_claude,
        enabled_codex = excluded.enabled_codex,
        enabled_gemini = excluded.enabled_gemini,
        enabled_cursor = excluded.enabled_cursor,
        updated_at = excluded.updated_at
    `).run(
      server.id,
      server.name,
      JSON.stringify(server.serverConfig),
      server.description,
      JSON.stringify(server.tags),
      server.enabled.claude ? 1 : 0,
      server.enabled.codex ? 1 : 0,
      server.enabled.gemini ? 1 : 0,
      server.enabled.cursor ? 1 : 0,
      server.createdAt,
      server.updatedAt,
    );
  },

  delete(id: string): void {
    appConfigDb.prepare('DELETE FROM unified_mcp_servers WHERE id = ?').run(id);
  },

  requireById(id: string): UnifiedMcpServer {
    const server = this.getById(id);
    if (!server) {
      throw new AppError('Unified MCP server not found.', { code: 'UNIFIED_MCP_NOT_FOUND', statusCode: 404 });
    }
    return server;
  },
};
```

Adjust the database import if the repo exposes a different SQLite handle than `appConfigDb`.

- [ ] **Step 6: Run repository test**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.repository.test.ts
```

Expected: PASS.

---

## Task 2: Add unified MCP validators

**Files:**
- Create: `server/modules/unified-mcp/unified-mcp.validators.ts`
- Test: `server/modules/unified-mcp/unified-mcp.validators.test.ts`

- [ ] **Step 1: Write failing validator tests**

Create `server/modules/unified-mcp/unified-mcp.validators.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseUnifiedMcpPayload, parseUnifiedMcpApp } from './unified-mcp.validators.js';

describe('unified MCP validators', () => {
  it('accepts stdio server payload with app flags', () => {
    expect(parseUnifiedMcpPayload({
      name: 'context7',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      enabled: { claude: true, codex: false, gemini: false, cursor: true },
    })).toMatchObject({
      name: 'context7',
      serverConfig: { transport: 'stdio', command: 'npx' },
      enabled: { claude: true, codex: false, gemini: false, cursor: true },
    });
  });

  it('rejects unsupported app names', () => {
    expect(() => parseUnifiedMcpApp('opencode')).toThrow('Unsupported unified MCP app');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.validators.test.ts
```

Expected: FAIL because validator file does not exist.

- [ ] **Step 3: Implement validators**

Create `server/modules/unified-mcp/unified-mcp.validators.ts`:

```ts
import type { UnifiedMcpApp, UnifiedMcpAppStates, UnifiedMcpServerConfig } from './unified-mcp.types.js';
import { UNIFIED_MCP_APPS } from './unified-mcp.types.js';
import { AppError } from '@/shared/utils.js';

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const readStringArray = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined
);

const readStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ));
};

const readEnabledStates = (value: unknown): UnifiedMcpAppStates => {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    claude: record.claude === true,
    codex: record.codex === true,
    gemini: record.gemini === true,
    cursor: record.cursor === true,
  };
};

export const parseUnifiedMcpApp = (value: unknown): UnifiedMcpApp => {
  if (typeof value === 'string' && UNIFIED_MCP_APPS.includes(value as UnifiedMcpApp)) {
    return value as UnifiedMcpApp;
  }
  throw new AppError('Unsupported unified MCP app.', { code: 'UNSUPPORTED_UNIFIED_MCP_APP', statusCode: 400 });
};

export const parseUnifiedMcpPayload = (payload: unknown): {
  name: string;
  description: string | null;
  tags: string[];
  serverConfig: UnifiedMcpServerConfig;
  enabled: UnifiedMcpAppStates;
} => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Request body must be an object.', { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
  }

  const body = payload as Record<string, unknown>;
  const name = readString(body.name);
  if (!name) {
    throw new AppError('name is required.', { code: 'UNIFIED_MCP_NAME_REQUIRED', statusCode: 400 });
  }

  const transport = readString(body.transport);
  if (transport !== 'stdio' && transport !== 'http' && transport !== 'sse') {
    throw new AppError('transport must be stdio, http, or sse.', { code: 'INVALID_UNIFIED_MCP_TRANSPORT', statusCode: 400 });
  }

  return {
    name,
    description: readString(body.description) ?? null,
    tags: readStringArray(body.tags) ?? [],
    serverConfig: {
      transport,
      command: readString(body.command),
      args: readStringArray(body.args),
      env: readStringRecord(body.env),
      cwd: readString(body.cwd),
      url: readString(body.url),
      headers: readStringRecord(body.headers),
      envVars: readStringArray(body.envVars),
      bearerTokenEnvVar: readString(body.bearerTokenEnvVar),
      envHttpHeaders: readStringRecord(body.envHttpHeaders),
    },
    enabled: readEnabledStates(body.enabled),
  };
};
```

- [ ] **Step 4: Run validator tests**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.validators.test.ts
```

Expected: PASS.

---

## Task 3: Implement unified MCP service and sync adapters

**Files:**
- Create: `server/modules/unified-mcp/unified-mcp.service.ts`
- Test: `server/modules/unified-mcp/unified-mcp.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `server/modules/unified-mcp/unified-mcp.service.test.ts` with mocks for `providerRegistry` and repository. Test these behaviors:

```ts
import { describe, expect, it, vi } from 'vitest';
import { unifiedMcpService } from './unified-mcp.service.js';

describe('unifiedMcpService', () => {
  it('syncs newly enabled apps through provider adapters', async () => {
    const result = await unifiedMcpService.create({
      name: 'context7',
      description: null,
      tags: [],
      serverConfig: { transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      enabled: { claude: true, codex: false, gemini: false, cursor: false },
    });

    expect(result.name).toBe('context7');
  });

  it('removes a server from provider config when an app is disabled', async () => {
    const server = await unifiedMcpService.toggleApp('context7', 'claude', false);

    expect(server.enabled.claude).toBe(false);
  });
});
```

Use `vi.mock()` to isolate provider adapter behavior if the current test harness supports it. If existing server tests use another mocking style, follow `server/modules/providers/tests/mcp.test.ts`.

- [ ] **Step 2: Run service test to verify it fails**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Create `server/modules/unified-mcp/unified-mcp.service.ts`:

```ts
import crypto from 'node:crypto';
import { unifiedMcpServersRepository } from '@/modules/database/repositories/unified-mcp-servers.js';
import { providerRegistry } from '@/modules/providers/provider.registry.js';
import type { LLMProvider, UpsertProviderMcpServerInput } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';
import type { UnifiedMcpApp, UnifiedMcpServer, UnifiedMcpServerConfig } from './unified-mcp.types.js';
import { UNIFIED_MCP_APPS } from './unified-mcp.types.js';

const now = () => Date.now();

const createId = (name: string): string => name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID();

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

const syncToApp = async (server: UnifiedMcpServer, app: UnifiedMcpApp): Promise<void> => {
  const provider = providerRegistry.resolveProvider(app as LLMProvider);
  await provider.mcp.upsertServer(toProviderPayload(server));
};

const removeFromApp = async (server: UnifiedMcpServer, app: UnifiedMcpApp): Promise<void> => {
  const provider = providerRegistry.resolveProvider(app as LLMProvider);
  await provider.mcp.removeServer({ name: server.name, scope: 'user' });
};

const syncEnabledApps = async (server: UnifiedMcpServer): Promise<void> => {
  for (const app of UNIFIED_MCP_APPS) {
    if (server.enabled[app]) {
      await syncToApp(server, app);
    }
  }
};

const configFingerprint = (config: UnifiedMcpServerConfig): string => crypto
  .createHash('sha256')
  .update(JSON.stringify(config))
  .digest('hex')
  .slice(0, 10);

export const unifiedMcpService = {
  list(): UnifiedMcpServer[] {
    return unifiedMcpServersRepository.list();
  },

  async create(input: Omit<UnifiedMcpServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<UnifiedMcpServer> {
    const timestamp = now();
    const baseId = createId(input.name);
    const id = unifiedMcpServersRepository.getById(baseId) ? `${baseId}-${configFingerprint(input.serverConfig)}` : baseId;
    const server: UnifiedMcpServer = { ...input, id, createdAt: timestamp, updatedAt: timestamp };
    unifiedMcpServersRepository.upsert(server);
    await syncEnabledApps(server);
    return server;
  },

  async update(id: string, input: Omit<UnifiedMcpServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<UnifiedMcpServer> {
    const existing = unifiedMcpServersRepository.requireById(id);
    const server: UnifiedMcpServer = { ...input, id, createdAt: existing.createdAt, updatedAt: now() };
    unifiedMcpServersRepository.upsert(server);
    await syncEnabledApps(server);
    return server;
  },

  async delete(id: string): Promise<{ deleted: true }> {
    const server = unifiedMcpServersRepository.requireById(id);
    for (const app of UNIFIED_MCP_APPS) {
      if (server.enabled[app]) {
        await removeFromApp(server, app);
      }
    }
    unifiedMcpServersRepository.delete(id);
    return { deleted: true };
  },

  async toggleApp(id: string, app: UnifiedMcpApp, enabled: boolean): Promise<UnifiedMcpServer> {
    const server = unifiedMcpServersRepository.requireById(id);
    const next: UnifiedMcpServer = {
      ...server,
      enabled: { ...server.enabled, [app]: enabled },
      updatedAt: now(),
    };
    if (enabled) {
      await syncToApp(next, app);
    } else {
      await removeFromApp(next, app);
    }
    unifiedMcpServersRepository.upsert(next);
    return next;
  },

  async importFromProviders(): Promise<{ imported: number; servers: UnifiedMcpServer[] }> {
    let imported = 0;
    for (const app of UNIFIED_MCP_APPS) {
      const provider = providerRegistry.resolveProvider(app as LLMProvider);
      const servers = await provider.mcp.listServersForScope('user');
      for (const providerServer of servers) {
        const serverConfig: UnifiedMcpServerConfig = {
          transport: providerServer.transport,
          command: providerServer.command,
          args: providerServer.args,
          env: providerServer.env,
          cwd: providerServer.cwd,
          url: providerServer.url,
          headers: providerServer.headers,
          envVars: providerServer.envVars,
          bearerTokenEnvVar: providerServer.bearerTokenEnvVar,
          envHttpHeaders: providerServer.envHttpHeaders,
        };
        const baseId = createId(providerServer.name);
        const existing = unifiedMcpServersRepository.getById(baseId);
        const id = existing && JSON.stringify(existing.serverConfig) !== JSON.stringify(serverConfig)
          ? `${baseId}-${app}`
          : baseId;
        const current = unifiedMcpServersRepository.getById(id);
        const timestamp = now();
        unifiedMcpServersRepository.upsert({
          id,
          name: providerServer.name,
          description: current?.description ?? null,
          tags: current?.tags ?? [],
          serverConfig: current?.serverConfig ?? serverConfig,
          enabled: {
            claude: current?.enabled.claude ?? false,
            codex: current?.enabled.codex ?? false,
            gemini: current?.enabled.gemini ?? false,
            cursor: current?.enabled.cursor ?? false,
            [app]: true,
          },
          createdAt: current?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });
        imported += current ? 0 : 1;
      }
    }

    return { imported, servers: unifiedMcpServersRepository.list() };
  },
};
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm --prefix claudecodeui run test -- server/modules/unified-mcp/unified-mcp.service.test.ts
```

Expected: PASS after adapting mocks to local test style.

---

## Task 4: Add unified MCP API routes

**Files:**
- Create: `server/modules/unified-mcp/unified-mcp.routes.ts`
- Modify: `server/index.js`
- Test: API smoke through curl or existing request test harness.

- [ ] **Step 1: Add routes**

Create `server/modules/unified-mcp/unified-mcp.routes.ts`:

```ts
import express, { type Request, type Response } from 'express';
import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';
import { unifiedMcpService } from './unified-mcp.service.js';
import { parseUnifiedMcpApp, parseUnifiedMcpPayload } from './unified-mcp.validators.js';

const router = express.Router();

router.get('/servers', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse({ servers: unifiedMcpService.list() }));
}));

router.post('/servers', asyncHandler(async (req: Request, res: Response) => {
  const payload = parseUnifiedMcpPayload(req.body);
  const server = await unifiedMcpService.create(payload);
  res.status(201).json(createApiSuccessResponse({ server }));
}));

router.put('/servers/:id', asyncHandler(async (req: Request, res: Response) => {
  const payload = parseUnifiedMcpPayload(req.body);
  const server = await unifiedMcpService.update(String(req.params.id), payload);
  res.json(createApiSuccessResponse({ server }));
}));

router.delete('/servers/:id', asyncHandler(async (req: Request, res: Response) => {
  const result = await unifiedMcpService.delete(String(req.params.id));
  res.json(createApiSuccessResponse(result));
}));

router.post('/servers/:id/apps/:app/toggle', asyncHandler(async (req: Request, res: Response) => {
  const app = parseUnifiedMcpApp(req.params.app);
  const enabled = req.body?.enabled === true;
  const server = await unifiedMcpService.toggleApp(String(req.params.id), app, enabled);
  res.json(createApiSuccessResponse({ server }));
}));

router.post('/import', asyncHandler(async (_req: Request, res: Response) => {
  const result = await unifiedMcpService.importFromProviders();
  res.json(createApiSuccessResponse(result));
}));

export default router;
```

- [ ] **Step 2: Mount routes**

In `server/index.js`, import and mount:

```js
import unifiedMcpRoutes from './modules/unified-mcp/unified-mcp.routes.js';
```

Then near other protected API routes:

```js
app.use('/api/unified-mcp', authenticateToken, unifiedMcpRoutes);
```

Use the existing auth middleware variable name exactly as in the file.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm --prefix claudecodeui run typecheck
```

Expected: PASS.

---

## Task 5: Add frontend unified MCP types and hook

**Files:**
- Modify: `src/components/mcp/types.ts`
- Create: `src/components/mcp/hooks/useUnifiedMcpServers.ts`

- [ ] **Step 1: Add frontend types**

Append to `src/components/mcp/types.ts`:

```ts
export type UnifiedMcpApp = 'claude' | 'codex' | 'gemini' | 'cursor';

export type UnifiedMcpAppStates = Record<UnifiedMcpApp, boolean>;

export type UnifiedMcpServer = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  serverConfig: {
    transport: McpTransport;
    command?: string;
    args?: string[];
    env?: KeyValueMap;
    cwd?: string;
    url?: string;
    headers?: KeyValueMap;
    envVars?: string[];
    bearerTokenEnvVar?: string;
    envHttpHeaders?: KeyValueMap;
  };
  enabled: UnifiedMcpAppStates;
  createdAt: number;
  updatedAt: number;
};
```

- [ ] **Step 2: Create hook**

Create `src/components/mcp/hooks/useUnifiedMcpServers.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import type { ApiResponse, McpFormState, UnifiedMcpApp, UnifiedMcpServer } from '../types';
import { createMcpPayloadFromForm, getErrorMessage } from '../utils/mcpFormatting';

const readJson = async <T,>(response: Response): Promise<T> => response.json() as Promise<T>;

const getApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
};

const formToUnifiedPayload = (formData: McpFormState, enabled?: UnifiedMcpServer['enabled']) => ({
  ...createMcpPayloadFromForm('claude', formData, { includeProviderSpecificFields: true }),
  enabled: enabled ?? { claude: false, codex: false, gemini: false, cursor: false },
});

export function useUnifiedMcpServers() {
  const [servers, setServers] = useState<UnifiedMcpServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

  const refreshServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/unified-mcp/servers');
      const data = await readJson<ApiResponse<{ servers: UnifiedMcpServer[] }>>(response);
      if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to load MCP servers'));
      setServers(data.data.servers);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createServer = useCallback(async (formData: McpFormState, enabled: UnifiedMcpServer['enabled']) => {
    const response = await authenticatedFetch('/api/unified-mcp/servers', {
      method: 'POST',
      body: JSON.stringify(formToUnifiedPayload(formData, enabled)),
    });
    const data = await readJson<ApiResponse<{ server: UnifiedMcpServer }>>(response);
    if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to create MCP server'));
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const updateServer = useCallback(async (server: UnifiedMcpServer, formData: McpFormState) => {
    const response = await authenticatedFetch(`/api/unified-mcp/servers/${encodeURIComponent(server.id)}`, {
      method: 'PUT',
      body: JSON.stringify(formToUnifiedPayload(formData, server.enabled)),
    });
    const data = await readJson<ApiResponse<{ server: UnifiedMcpServer }>>(response);
    if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to update MCP server'));
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const deleteServer = useCallback(async (server: UnifiedMcpServer) => {
    const response = await authenticatedFetch(`/api/unified-mcp/servers/${encodeURIComponent(server.id)}`, { method: 'DELETE' });
    const data = await readJson<ApiResponse<{ deleted: true }>>(response);
    if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to delete MCP server'));
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const toggleApp = useCallback(async (server: UnifiedMcpServer, app: UnifiedMcpApp, enabled: boolean) => {
    const response = await authenticatedFetch(`/api/unified-mcp/servers/${encodeURIComponent(server.id)}/apps/${app}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    const data = await readJson<ApiResponse<{ server: UnifiedMcpServer }>>(response);
    if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to update MCP app state'));
    await refreshServers();
    setSaveStatus('success');
  }, [refreshServers]);

  const importFromProviders = useCallback(async () => {
    const response = await authenticatedFetch('/api/unified-mcp/import', { method: 'POST' });
    const data = await readJson<ApiResponse<{ imported: number; servers: UnifiedMcpServer[] }>>(response);
    if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, 'Failed to import MCP servers'));
    setServers(data.data.servers);
    setSaveStatus('success');
  }, []);

  useEffect(() => { void refreshServers(); }, [refreshServers]);

  useEffect(() => {
    if (saveStatus === null) return;
    const timer = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  return { servers, isLoading, error, saveStatus, refreshServers, createServer, updateServer, deleteServer, toggleApp, importFromProviders };
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm --prefix claudecodeui run typecheck
```

Expected: PASS after adapting payload conversion if needed.

---

## Task 6: Convert MCP UI to unified panel

**Files:**
- Modify: `src/components/mcp/view/McpServers.tsx`
- Modify: `src/components/mcp/view/modals/McpServerFormModal.tsx` if needed

- [ ] **Step 1: Replace provider-owned hook usage**

In `McpServers.tsx`, replace `useMcpServers({ selectedProvider, currentProjects })` with `useUnifiedMcpServers()`.

Render one list from `UnifiedMcpServer[]`.

- [ ] **Step 2: Add app switch row**

Add constant:

```ts
const UNIFIED_MCP_APPS: Array<{ id: UnifiedMcpApp; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'cursor', label: 'Cursor' },
];
```

Inside each server card, render:

```tsx
<div className="mt-3 flex flex-wrap gap-2">
  {UNIFIED_MCP_APPS.map((app) => (
    <button
      key={app.id}
      type="button"
      onClick={() => toggleApp(server, app.id, !server.enabled[app.id])}
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
```

Import `cn` from existing utility path used elsewhere.

- [ ] **Step 3: Replace buttons**

Top buttons become:

```tsx
<Button onClick={() => openForm()} size="sm">
  <Plus className="mr-2 h-4 w-4" />
  Add MCP Server
</Button>
<Button onClick={importFromProviders} variant="outline" size="sm">
  Import from apps
</Button>
```

Remove `Add Global MCP Server` and `Add ${providerName} MCP Server` from unified UI.

- [ ] **Step 4: Adapt form submit**

For create:

```ts
await createServer(formData, { claude: true, codex: false, gemini: false, cursor: false });
```

Default Claude enabled for newly created server unless UI adds checkboxes in the form. This mirrors a safe default while still allowing toggles after creation.

For edit:

```ts
await updateServer(editingServer, formData);
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm --prefix claudecodeui run typecheck
```

Expected: PASS.

---

## Task 7: Wire settings to unified MCP panel

**Files:**
- Modify: `src/components/settings/view/tabs/agents-settings/sections/AgentCategoryContentSection.tsx`

- [ ] **Step 1: Stop provider-specific MCP rendering**

Change MCP section from:

```tsx
<McpServers selectedProvider={selectedAgent} currentProjects={projects.map(...)} />
```

to either:

```tsx
<McpServers currentProjects={projects.map(...)} />
```

or:

```tsx
<McpServers />
```

if project scope is fully removed from the unified component.

- [ ] **Step 2: Keep old provider selection unrelated**

Do not change agent list behavior. The MCP tab shows the same unified panel no matter which agent is selected.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm --prefix claudecodeui run typecheck
```

Expected: PASS.

---

## Task 8: Verification and dev restart

**Files:**
- No source changes unless verification finds defects.

- [ ] **Step 1: Run backend/frontend checks**

Run:

```bash
npm --prefix claudecodeui run typecheck
npm --prefix claudecodeui run lint -- --quiet
```

Expected: both PASS.

- [ ] **Step 2: Restart dev server**

Run:

```bash
{ lsof -ti tcp:3001; lsof -ti tcp:5173; } 2>/dev/null | sort -u | xargs -r kill
npm --prefix claudecodeui run dev
```

Expected:

```text
VITE ready ... http://localhost:5173/
CloudCLI Server - Ready ... http://localhost:3001
```

- [ ] **Step 3: Manual UI smoke test**

In Settings:

1. Open `智能体 > MCP 服务器`.
2. Confirm the page shows one unified list, not Claude/Codex-specific buttons.
3. Click `Import from apps`.
4. Confirm imported servers show app enable states.
5. Add a test MCP server with Claude enabled.
6. Toggle Codex on and Claude off.
7. Confirm no UI errors and list refreshes.

- [ ] **Step 4: Do not delete old provider MCP APIs**

Confirm these still exist:

```text
/api/providers/:provider/mcp/servers
/api/providers/mcp/servers/global
```

---

## Self-Review

- Spec coverage: unified MCP DB/API/service/UI, app switches, import from providers, provider adapters retained, old APIs retained, Skills excluded.
- Placeholder scan: no TBD/TODO items remain; project/local scope intentionally excluded from Milestone 1.
- Type consistency: `UnifiedMcpApp`, `UnifiedMcpServer`, `enabled`, `serverConfig`, and route names are consistent across tasks.

---

## Execution Recommendation

Use subagent-driven development for Task 1-4 backend, then inline review, then Task 5-7 frontend, then verification. Commit after each task if this repository workflow requires commits; otherwise keep changes uncommitted for user review.
