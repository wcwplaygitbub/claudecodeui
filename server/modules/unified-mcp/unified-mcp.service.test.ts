import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase } from '../database/index.js';
import { unifiedMcpServersDb } from '../database/index.js';
import { unifiedMcpService } from './unified-mcp.service.js';

const patchHomeDir = (nextHomeDir: string) => {
  const original = os.homedir;
  (os as any).homedir = () => nextHomeDir;
  return () => {
    (os as any).homedir = original;
  };
};

const readJson = async (filePath: string): Promise<Record<string, unknown>> => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
};

const withTempAppState = async (run: (tempRoot: string) => Promise<void>): Promise<void> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'unified-mcp-'));
  const dbPath = path.join(tempRoot, 'cloudcli.db');
  const previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = dbPath;
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    await initializeDatabase();
    await run(tempRoot);
  } finally {
    closeConnection();
    restoreHomeDir();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
};

test('unifiedMcpService stores one server and toggles provider configs through adapters', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const created = await unifiedMcpService.create({
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
        gemini: false,
        cursor: false,
      },
    });

    assert.equal(created.id, 'context7');
    assert.equal(created.enabled.claude, true);
    assert.equal(unifiedMcpServersDb.list().length, 1);

    const claudeConfig = await readJson(path.join(tempRoot, '.claude.json'));
    assert.ok((claudeConfig.mcpServers as Record<string, unknown>).context7);

    const enabledCodex = await unifiedMcpService.toggleApp('context7', 'codex', true);
    assert.equal(enabledCodex.enabled.codex, true);

    const codexConfig = await fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf8');
    assert.match(codexConfig, /context7/);

    const disabledClaude = await unifiedMcpService.toggleApp('context7', 'claude', false);
    assert.equal(disabledClaude.enabled.claude, false);

    const nextClaudeConfig = await readJson(path.join(tempRoot, '.claude.json'));
    assert.equal((nextClaudeConfig.mcpServers as Record<string, unknown>).context7, undefined);
  });
});

test('unifiedMcpService removes old app config names when an enabled server is renamed', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    await unifiedMcpService.create({
      name: 'old-name',
      description: null,
      tags: [],
      serverConfig: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
      enabled: {
        claude: true,
        codex: false,
        gemini: false,
        cursor: false,
      },
    });

    await unifiedMcpService.update('old-name', {
      name: 'new-name',
      description: null,
      tags: [],
      serverConfig: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
      enabled: {
        claude: true,
        codex: false,
        gemini: false,
        cursor: false,
      },
    });

    const claudeConfig = await readJson(path.join(tempRoot, '.claude.json'));
    const mcpServers = claudeConfig.mcpServers as Record<string, unknown>;
    assert.equal(mcpServers['old-name'], undefined);
    assert.ok(mcpServers['new-name']);
  });
});
