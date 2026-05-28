import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, unifiedSkillsDb } from '../database/index.js';
import { unifiedSkillsService } from './unified-skills.service.js';

const patchHomeDir = (nextHomeDir: string) => {
  const original = os.homedir;
  (os as any).homedir = () => nextHomeDir;
  return () => {
    (os as any).homedir = original;
  };
};

const withTempAppState = async (run: (tempRoot: string) => Promise<void>): Promise<void> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'unified-skills-'));
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

const writeSkill = async (skillDir: string, name: string, description: string, body: string): Promise<void> => {
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
    'utf8',
  );
};

const readSkillBody = async (skillDir: string): Promise<string> => fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
};

test('unifiedSkillsService imports app skills and does not overwrite existing app directories when enabling', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'writer');
    const codexSkillDir = path.join(tempRoot, '.agents', 'skills', 'writer');
    await writeSkill(claudeSkillDir, 'writer', 'Claude writer', 'from claude');
    await writeSkill(codexSkillDir, 'writer', 'User codex writer', 'must stay');

    const imported = await unifiedSkillsService.importFromApps([
      {
        directory: 'writer',
        enabled: {
          claude: true,
          codex: false,
          gemini: false,
          cursor: false,
        },
      },
    ]);

    assert.equal(imported.length, 1);
    assert.equal(unifiedSkillsDb.list().length, 1);

    const enabledCodex = await unifiedSkillsService.toggleApp('writer', 'codex', true);
    assert.equal(enabledCodex.enabled.codex, true);

    const codexContent = await readSkillBody(codexSkillDir);
    assert.match(codexContent, /must stay/);
    assert.equal(unifiedSkillsDb.getSync('writer', 'codex'), null);
  });
});

test('unifiedSkillsService scans symlinked skill directories', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const sourceSkillDir = path.join(tempRoot, '.cc-switch', 'skills', 'problem-hunter');
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'problem-hunter');
    await writeSkill(sourceSkillDir, 'problem-hunter', 'Problem hunter', 'from cc-switch');
    await fs.mkdir(path.dirname(claudeSkillDir), { recursive: true });
    await fs.symlink(sourceSkillDir, claudeSkillDir, 'dir');

    const unmanaged = await unifiedSkillsService.scanUnmanaged();

    assert.equal(unmanaged.length, 1);
    assert.equal(unmanaged[0]?.directory, 'problem-hunter');
    assert.deepEqual(unmanaged[0]?.foundIn, ['claude']);
  });
});

test('unifiedSkillsService disables imported source app skills without deleting the source copy', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'bec-db-query');
    await writeSkill(claudeSkillDir, 'bec-db-query', 'BEC DB query', 'from claude');

    const [imported] = await unifiedSkillsService.importFromApps([
      {
        directory: 'bec-db-query',
        enabled: {
          claude: true,
          codex: false,
          gemini: false,
          cursor: false,
        },
      },
    ]);

    assert.ok(imported);
    assert.equal(await pathExists(path.join(claudeSkillDir, 'SKILL.md')), true);
    assert.notEqual(imported.sourcePath, claudeSkillDir);

    await unifiedSkillsService.toggleApp('bec-db-query', 'claude', false);

    assert.equal(await pathExists(path.join(claudeSkillDir, 'SKILL.md')), false);
    assert.equal(await pathExists(path.join(imported.sourcePath, 'SKILL.md')), true);
  });
});

test('unifiedSkillsService list reconciles disabled legacy source app skills', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'bec-db-query');
    await writeSkill(claudeSkillDir, 'bec-db-query', 'BEC DB query', 'legacy disabled source');
    unifiedSkillsDb.save({
      id: 'bec-db-query',
      name: 'bec-db-query',
      description: 'BEC DB query',
      directory: 'bec-db-query',
      sourcePath: claudeSkillDir,
      enabled: {
        claude: false,
        codex: false,
        gemini: false,
        cursor: false,
      },
    });

    const [skill] = await unifiedSkillsService.list();

    assert.ok(skill);
    assert.equal(skill.enabled.claude, false);
    assert.equal(await pathExists(path.join(claudeSkillDir, 'SKILL.md')), false);
    assert.equal(await pathExists(path.join(skill.sourcePath, 'SKILL.md')), true);
    assert.notEqual(skill.sourcePath, claudeSkillDir);
  });
});

test('unifiedSkillsService disables legacy imported source app skills', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'bec-db-query');
    await writeSkill(claudeSkillDir, 'bec-db-query', 'BEC DB query', 'legacy source');
    unifiedSkillsDb.save({
      id: 'bec-db-query',
      name: 'bec-db-query',
      description: 'BEC DB query',
      directory: 'bec-db-query',
      sourcePath: claudeSkillDir,
      enabled: {
        claude: true,
        codex: false,
        gemini: false,
        cursor: false,
      },
    });

    const disabled = await unifiedSkillsService.toggleApp('bec-db-query', 'claude', false);

    assert.equal(disabled.enabled.claude, false);
    assert.equal(await pathExists(path.join(claudeSkillDir, 'SKILL.md')), false);
    assert.equal(await pathExists(path.join(disabled.sourcePath, 'SKILL.md')), true);
    assert.notEqual(disabled.sourcePath, claudeSkillDir);
  });
});

test('unifiedSkillsService deletes managed source directory when deleting a skill', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const managedSkillDir = path.join(tempRoot, '.cloudcli', 'unified-skills', 'writer');
    await writeSkill(managedSkillDir, 'writer', 'Managed writer', 'managed source');

    const created = await unifiedSkillsService.create({
      name: 'writer',
      description: 'Managed writer',
      directory: 'writer',
      sourcePath: managedSkillDir,
      enabled: {
        claude: false,
        codex: false,
        gemini: false,
        cursor: false,
      },
    });

    const result = await unifiedSkillsService.delete(created.id);

    assert.equal(result.deleted, true);
    assert.equal(unifiedSkillsDb.get(created.id), null);
    assert.equal(await pathExists(path.join(managedSkillDir, 'SKILL.md')), false);
  });
});

test('unifiedSkillsService removes only directories it created during sync', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'reader');
    const geminiSkillDir = path.join(tempRoot, '.gemini', 'skills', 'reader');
    await writeSkill(claudeSkillDir, 'reader', 'Reader skill', 'from claude');

    await unifiedSkillsService.importFromApps([
      {
        directory: 'reader',
        enabled: {
          claude: true,
          codex: false,
          gemini: false,
          cursor: false,
        },
      },
    ]);

    await unifiedSkillsService.toggleApp('reader', 'gemini', true);
    assert.match(await readSkillBody(geminiSkillDir), /from claude/);
    assert.ok(unifiedSkillsDb.getSync('reader', 'gemini'));

    await unifiedSkillsService.toggleApp('reader', 'gemini', false);
    await assert.rejects(() => fs.stat(geminiSkillDir));

    await writeSkill(geminiSkillDir, 'reader', 'User reader', 'user managed');
    await unifiedSkillsService.toggleApp('reader', 'gemini', true);
    assert.equal(unifiedSkillsDb.getSync('reader', 'gemini'), null);

    await unifiedSkillsService.toggleApp('reader', 'gemini', false);
    assert.match(await readSkillBody(geminiSkillDir), /user managed/);
  });
});
