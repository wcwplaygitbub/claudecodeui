import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import JSZip from 'jszip';

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

const createSkillZip = async (entries: Record<string, string>): Promise<Buffer> => {
  const zip = new JSZip();
  for (const [entryPath, content] of Object.entries(entries)) {
    zip.file(entryPath, content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
};

const skillMarkdown = (name: string, description: string, body: string): string => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

const emptyEnabled = () => ({
  claude: false,
  codex: false,
});

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
        },
      },
    ]);

    assert.equal(imported.length, 1);
    assert.ok(unifiedSkillsDb.get('writer'));

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
    const codexSkillDir = path.join(tempRoot, '.agents', 'skills', 'reader');
    await writeSkill(claudeSkillDir, 'reader', 'Reader skill', 'from claude');

    await unifiedSkillsService.importFromApps([
      {
        directory: 'reader',
        enabled: {
          claude: true,
          codex: false,
        },
      },
    ]);

    await unifiedSkillsService.toggleApp('reader', 'codex', true);
    assert.match(await readSkillBody(codexSkillDir), /from claude/);
    assert.ok(unifiedSkillsDb.getSync('reader', 'codex'));

    await unifiedSkillsService.toggleApp('reader', 'codex', false);
    await assert.rejects(() => fs.stat(codexSkillDir));

    await writeSkill(codexSkillDir, 'reader', 'User reader', 'user managed');
    await unifiedSkillsService.toggleApp('reader', 'codex', true);
    assert.equal(unifiedSkillsDb.getSync('reader', 'codex'), null);

    await unifiedSkillsService.toggleApp('reader', 'codex', false);
    assert.match(await readSkillBody(codexSkillDir), /user managed/);
  });
});

test('unifiedSkillsService previews a valid nested skill zip', { concurrency: false }, async () => {
  await withTempAppState(async () => {
    const zip = await createSkillZip({
      'zip-manual-writer/SKILL.md': skillMarkdown('Zip Writer', 'Writes well', 'Use this skill to write.'),
      'zip-manual-writer/examples/example.md': 'Example',
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'zip-manual-writer.zip');

    assert.equal(preview.valid, true);
    assert.equal(preview.directory, 'zip-manual-writer');
    assert.equal(preview.id, 'zip-manual-writer');
    assert.equal(preview.name, 'Zip Writer');
    assert.equal(preview.description, 'Writes well');
    assert.deepEqual(preview.errors, []);
  });
});

test('unifiedSkillsService previews a root skill zip using the zip file name as directory', { concurrency: false }, async () => {
  await withTempAppState(async () => {
    const zip = await createSkillZip({
      'SKILL.md': skillMarkdown('Root Writer', 'Root skill', 'Use this skill.'),
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'root-writer.zip');

    assert.equal(preview.valid, true);
    assert.equal(preview.directory, 'root-writer');
    assert.equal(preview.name, 'Root Writer');
  });
});

test('unifiedSkillsService rejects zip previews without SKILL.md', { concurrency: false }, async () => {
  await withTempAppState(async () => {
    const zip = await createSkillZip({
      'writer/README.md': 'No skill definition',
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'writer.zip');

    assert.equal(preview.valid, false);
    assert.equal(preview.errors.some((error) => error.code === 'SKILL_MD_REQUIRED'), true);
  });
});

test('unifiedSkillsService rejects zip previews with multiple skill definitions', { concurrency: false }, async () => {
  await withTempAppState(async () => {
    const zip = await createSkillZip({
      'writer/SKILL.md': skillMarkdown('Writer', 'Writes', 'body'),
      'reader/SKILL.md': skillMarkdown('Reader', 'Reads', 'body'),
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'skills.zip');

    assert.equal(preview.valid, false);
    assert.equal(preview.errors.some((error) => error.code === 'MULTIPLE_SKILL_DEFINITIONS'), true);
  });
});

test('unifiedSkillsService rejects zip previews with escaping paths', { concurrency: false }, async () => {
  await withTempAppState(async () => {
    const zip = await createSkillZip({
      'writer/SKILL.md': skillMarkdown('Writer', 'Writes', 'body'),
      '/evil.txt': 'escape',
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'writer.zip');

    assert.equal(preview.valid, false);
    assert.equal(preview.errors.some((error) => error.code === 'UNSAFE_ZIP_PATH'), true);
  });
});

test('unifiedSkillsService reports managed conflicts and rejects final zip import', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const managedSkillDir = path.join(tempRoot, '.cloudcli', 'unified-skills', 'writer');
    await writeSkill(managedSkillDir, 'writer', 'Existing writer', 'existing');
    unifiedSkillsDb.save({
      id: 'writer',
      name: 'Existing writer',
      description: 'Existing',
      directory: 'writer',
      sourcePath: managedSkillDir,
      enabled: emptyEnabled(),
    });

    const zip = await createSkillZip({
      'writer/SKILL.md': skillMarkdown('Writer', 'Writes well', 'new'),
    });

    const preview = await unifiedSkillsService.previewZip(zip, 'writer.zip');
    assert.equal(preview.valid, false);
    assert.equal(preview.conflicts.managed, true);

    await assert.rejects(
      () => unifiedSkillsService.importFromZip({ buffer: zip, originalName: 'writer.zip', enabled: emptyEnabled() }),
      /already exists/i,
    );
  });
});

test('unifiedSkillsService imports a valid skill zip into the managed root', { concurrency: false }, async (t) => {
  await withTempAppState(async (tempRoot) => {
    const zip = await createSkillZip({
      'zip-manual-import-writer/SKILL.md': skillMarkdown('Zip Import Writer', 'Writes well', 'zip body'),
      'zip-manual-import-writer/reference.md': 'Reference',
    });

    const { skill } = await unifiedSkillsService.importFromZip({
      buffer: zip,
      originalName: 'zip-manual-import-writer.zip',
      enabled: emptyEnabled(),
    });
    t.after(async () => {
      await unifiedSkillsService.delete(skill.id).catch(() => undefined);
    });

    assert.equal(skill.id, 'zip-manual-import-writer');
    assert.equal(skill.name, 'Zip Import Writer');
    assert.equal(skill.sourcePath, path.join(tempRoot, '.cloudcli', 'unified-skills', 'zip-manual-import-writer'));
    assert.equal(await pathExists(path.join(skill.sourcePath, 'SKILL.md')), true);
    assert.equal(await pathExists(path.join(skill.sourcePath, 'reference.md')), true);
    assert.ok(unifiedSkillsDb.get('zip-manual-import-writer'));
  });
});

test('unifiedSkillsService zip import does not overwrite existing app skill directories', { concurrency: false }, async () => {
  await withTempAppState(async (tempRoot) => {
    const claudeSkillDir = path.join(tempRoot, '.claude', 'skills', 'zip-manual-app-conflict-writer');
    await writeSkill(claudeSkillDir, 'Existing app writer', 'Existing app skill', 'must stay');
    const zip = await createSkillZip({
      'zip-manual-app-conflict-writer/SKILL.md': skillMarkdown('Zip App Writer', 'Writes well', 'from zip'),
    });

    const { skill, warnings } = await unifiedSkillsService.importFromZip({
      buffer: zip,
      originalName: 'zip-manual-app-conflict-writer.zip',
      enabled: { ...emptyEnabled(), claude: true },
    });

    assert.equal(skill.enabled.claude, true);
    assert.equal(warnings.some((warning) => warning.code === 'APP_SKILL_EXISTS'), true);
    assert.match(await readSkillBody(claudeSkillDir), /must stay/);
    assert.equal(unifiedSkillsDb.getSync('zip-manual-app-conflict-writer', 'claude'), null);
  });
});
