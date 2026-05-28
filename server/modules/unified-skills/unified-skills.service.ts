import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { unifiedSkillsDb } from '@/modules/database/index.js';
import { readProviderSkillMarkdownDefinition } from '@/shared/utils.js';
import { AppError } from '@/shared/utils.js';
import type {
  SaveUnifiedSkillInput,
  UnifiedSkill,
  UnifiedSkillApp,
  UnifiedSkillAppStates,
} from './unified-skills.types.js';
import { UNIFIED_SKILL_APPS } from './unified-skills.types.js';

type ImportSkillSelection = {
  directory: string;
  enabled: UnifiedSkillAppStates;
};

type UnmanagedSkill = {
  directory: string;
  name: string;
  description: string;
  foundIn: UnifiedSkillApp[];
  path: string;
};

const emptyEnabled = (): UnifiedSkillAppStates => ({
  claude: false,
  codex: false,
  gemini: false,
  cursor: false,
});

const appSkillRoots = (): Record<UnifiedSkillApp, string> => ({
  claude: path.join(os.homedir(), '.claude', 'skills'),
  codex: path.join(os.homedir(), '.agents', 'skills'),
  gemini: path.join(os.homedir(), '.gemini', 'skills'),
  cursor: path.join(os.homedir(), '.cursor', 'skills'),
});

const managedSkillRoot = (): string => path.join(os.homedir(), '.cloudcli', 'unified-skills');

const normalizeDirectory = (directory: string): string => {
  const normalized = directory.trim();
  if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized === '.' || normalized === '..') {
    throw new AppError('Invalid skill directory.', {
      code: 'INVALID_SKILL_DIRECTORY',
      statusCode: 400,
    });
  }
  return normalized;
};

const skillIdFromDirectory = (directory: string): string => normalizeDirectory(directory).toLowerCase();

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const copyDirectory = async (sourcePath: string, targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, dereference: true });
};

const createManagedSourceCopy = async (directory: string, sourcePath: string): Promise<string> => {
  const targetPath = path.join(managedSkillRoot(), directory);
  if (!(await pathExists(targetPath))) {
    await copyDirectory(sourcePath, targetPath);
  }
  return targetPath;
};

const readSkillMeta = async (skillDir: string): Promise<{ name: string; description: string }> =>
  readProviderSkillMarkdownDefinition(path.join(skillDir, 'SKILL.md'));

const requireSkill = (id: string): UnifiedSkill => {
  const skill = unifiedSkillsDb.get(id);
  if (!skill) {
    throw new AppError('Unified skill not found.', {
      code: 'UNIFIED_SKILL_NOT_FOUND',
      statusCode: 404,
    });
  }
  return skill;
};

const findSourceForDirectory = async (directory: string): Promise<string | null> => {
  const roots = appSkillRoots();
  for (const app of UNIFIED_SKILL_APPS) {
    const candidate = path.join(roots[app], directory);
    if (await pathExists(path.join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }
  return null;
};

const syncToApp = async (skill: UnifiedSkill, app: UnifiedSkillApp): Promise<void> => {
  const targetPath = path.join(appSkillRoots()[app], skill.directory);
  if (await pathExists(targetPath)) {
    return;
  }

  await copyDirectory(skill.sourcePath, targetPath);
  unifiedSkillsDb.saveSync(skill.id, app, targetPath);
};

const trackImportedSourceApp = async (skill: UnifiedSkill, app: UnifiedSkillApp, sourcePath: string): Promise<void> => {
  const targetPath = path.join(appSkillRoots()[app], skill.directory);
  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    unifiedSkillsDb.saveSync(skill.id, app, targetPath);
  }
};

const detachAppSource = async (skill: UnifiedSkill, app: UnifiedSkillApp): Promise<UnifiedSkill> => {
  const targetPath = path.join(appSkillRoots()[app], skill.directory);
  if (path.resolve(skill.sourcePath) !== path.resolve(targetPath)) {
    return skill;
  }

  const managedSourcePath = await createManagedSourceCopy(skill.directory, skill.sourcePath);
  unifiedSkillsDb.saveSync(skill.id, app, targetPath);
  return { ...skill, sourcePath: managedSourcePath };
};

const removeFromApp = async (skill: UnifiedSkill, app: UnifiedSkillApp): Promise<void> => {
  const sync = unifiedSkillsDb.getSync(skill.id, app);
  if (!sync) {
    return;
  }

  await fs.rm(sync.targetPath, { recursive: true, force: true });
  unifiedSkillsDb.deleteSync(skill.id, app);
};

const removeManagedSource = async (skill: UnifiedSkill): Promise<void> => {
  const root = path.resolve(managedSkillRoot());
  const sourcePath = path.resolve(skill.sourcePath);
  if (sourcePath === root || !sourcePath.startsWith(`${root}${path.sep}`)) {
    return;
  }

  await fs.rm(sourcePath, { recursive: true, force: true });
};

const saveSkillWithEnabled = (skill: UnifiedSkill, enabled: UnifiedSkillAppStates): UnifiedSkill => unifiedSkillsDb.save({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  directory: skill.directory,
  sourcePath: skill.sourcePath,
  enabled,
});

const reconcileDisabledAppCopies = async (skill: UnifiedSkill): Promise<UnifiedSkill> => {
  let next = skill;
  for (const app of UNIFIED_SKILL_APPS) {
    if (!next.enabled[app]) {
      const detached = await detachAppSource(next, app);
      next = detached.sourcePath === next.sourcePath ? next : saveSkillWithEnabled(detached, detached.enabled);
      await removeFromApp(next, app);
      const current = unifiedSkillsDb.get(next.id);
      next = current ?? next;
    }
  }
  return next;
};

export const unifiedSkillsService = {
  async list(): Promise<UnifiedSkill[]> {
    const skills = unifiedSkillsDb.list();
    return Promise.all(skills.map(reconcileDisabledAppCopies));
  },

  async scanUnmanaged(): Promise<UnmanagedSkill[]> {
    const managedDirectories = new Set(unifiedSkillsDb.list().map((skill) => skill.directory));
    const byDirectory = new Map<string, UnmanagedSkill>();
    const roots = appSkillRoots();

    for (const app of UNIFIED_SKILL_APPS) {
      let entries;
      try {
        entries = await fs.readdir(roots[app], { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') || managedDirectories.has(entry.name)) {
          continue;
        }

        const skillDir = path.join(roots[app], entry.name);
        const stats = await fs.stat(skillDir).catch(() => null);
        if (!stats?.isDirectory()) {
          continue;
        }

        if (!(await pathExists(path.join(skillDir, 'SKILL.md')))) {
          continue;
        }

        const meta = await readSkillMeta(skillDir);
        const existing = byDirectory.get(entry.name);
        if (existing) {
          existing.foundIn.push(app);
        } else {
          byDirectory.set(entry.name, {
            directory: entry.name,
            name: meta.name,
            description: meta.description,
            foundIn: [app],
            path: skillDir,
          });
        }
      }
    }

    return [...byDirectory.values()].sort((left, right) => left.name.localeCompare(right.name));
  },

  async importFromApps(selections: ImportSkillSelection[]): Promise<UnifiedSkill[]> {
    const imported: UnifiedSkill[] = [];

    for (const selection of selections) {
      const directory = normalizeDirectory(selection.directory);
      const sourcePath = await findSourceForDirectory(directory);
      if (!sourcePath) {
        continue;
      }

      const meta = await readSkillMeta(sourcePath);
      const id = skillIdFromDirectory(directory);
      const existing = unifiedSkillsDb.get(id);
      const managedSourcePath = existing?.sourcePath ?? await createManagedSourceCopy(directory, sourcePath);
      const saved = unifiedSkillsDb.save({
        id,
        name: meta.name,
        description: meta.description,
        directory,
        sourcePath: managedSourcePath,
        enabled: selection.enabled,
      });

      for (const app of UNIFIED_SKILL_APPS) {
        if (saved.enabled[app]) {
          await trackImportedSourceApp(saved, app, sourcePath);
          await syncToApp(saved, app);
        }
      }

      imported.push(saved);
    }

    return imported;
  },

  async create(input: Omit<SaveUnifiedSkillInput, 'id'>): Promise<UnifiedSkill> {
    const directory = normalizeDirectory(input.directory);
    const meta = await readSkillMeta(input.sourcePath);
    const saved = unifiedSkillsDb.save({
      ...input,
      id: skillIdFromDirectory(directory),
      directory,
      name: input.name || meta.name,
      description: input.description || meta.description,
    });

    for (const app of UNIFIED_SKILL_APPS) {
      if (saved.enabled[app]) {
        await syncToApp(saved, app);
      }
    }

    return saved;
  },

  async toggleApp(id: string, app: UnifiedSkillApp, enabled: boolean): Promise<UnifiedSkill> {
    const skill = requireSkill(id);
    const sourceSafeSkill = enabled ? skill : await detachAppSource(skill, app);
    const next = saveSkillWithEnabled(sourceSafeSkill, { ...sourceSafeSkill.enabled, [app]: enabled });

    if (enabled) {
      await syncToApp(next, app);
    } else {
      await removeFromApp(sourceSafeSkill, app);
    }

    return next;
  },

  async delete(id: string): Promise<{ deleted: boolean }> {
    const skill = requireSkill(id);
    for (const app of UNIFIED_SKILL_APPS) {
      await removeFromApp(skill, app);
    }
    await removeManagedSource(skill);
    return { deleted: unifiedSkillsDb.delete(id) };
  },
};
