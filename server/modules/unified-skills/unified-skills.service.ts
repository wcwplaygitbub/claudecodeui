import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import JSZip from 'jszip';

import { unifiedSkillsDb } from '@/modules/database/index.js';
import { readProviderSkillMarkdownDefinition, readProviderSkillMarkdownDefinitionFromContent } from '@/shared/utils.js';
import { AppError } from '@/shared/utils.js';
import type {
  ImportZipSkillInput,
  SaveUnifiedSkillInput,
  UnifiedSkill,
  UnifiedSkillApp,
  UnifiedSkillAppStates,
  UnifiedSkillZipPreview,
  UnifiedSkillZipValidationIssue,
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

type ZipSkillEntry = {
  originalPath: string;
  relativePath: string;
  content: Buffer;
};

type ParsedZipSkill = {
  preview: UnifiedSkillZipPreview;
  entries: ZipSkillEntry[];
};

const emptyEnabled = (): UnifiedSkillAppStates => ({
  claude: false,
  codex: false,
});

const appSkillRoots = (): Record<UnifiedSkillApp, string> => ({
  claude: path.join(os.homedir(), '.claude', 'skills'),
  codex: path.join(os.homedir(), '.agents', 'skills'),
});

const managedSkillRoot = (): string => path.join(os.homedir(), '.cloudcli', 'unified-skills');

const zipDirectoryFromName = (originalName: string): string => path.basename(originalName, path.extname(originalName));

const addIssue = (issues: UnifiedSkillZipValidationIssue[], code: string, message: string): void => {
  if (!issues.some((issue) => issue.code === code && issue.message === message)) {
    issues.push({ code, message });
  }
};

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

const unsafeZipPath = (entryPath: string): boolean => {
  if (!entryPath || entryPath.includes('\0') || entryPath.includes('\\')) {
    return true;
  }

  if (path.posix.isAbsolute(entryPath) || /^[a-zA-Z]:/.test(entryPath)) {
    return true;
  }

  return entryPath.split('/').some((part) => part === '..');
};

const appConflictsForDirectory = async (directory: string): Promise<UnifiedSkillApp[]> => {
  const roots = appSkillRoots();
  const conflicts: UnifiedSkillApp[] = [];
  for (const app of UNIFIED_SKILL_APPS) {
    if (await pathExists(path.join(roots[app], directory))) {
      conflicts.push(app);
    }
  }
  return conflicts;
};

const emptyZipPreview = (): UnifiedSkillZipPreview => ({
  valid: false,
  directory: '',
  id: '',
  name: '',
  description: '',
  warnings: [],
  errors: [],
  conflicts: {
    managed: false,
    apps: [],
  },
});

const parseZipSkill = async (buffer: Buffer, originalName: string): Promise<ParsedZipSkill> => {
  const preview = emptyZipPreview();
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    addIssue(preview.errors, 'INVALID_ZIP', 'ZIP 文件无法解析。');
    return { preview, entries: [] };
  }

  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const unsafeEntry = files.find((entry) => unsafeZipPath(entry.name));
  if (unsafeEntry) {
    addIssue(preview.errors, 'UNSAFE_ZIP_PATH', `ZIP 内存在不安全路径：${unsafeEntry.name}`);
  }

  const skillMarkdownFiles = files.filter((entry) => path.posix.basename(entry.name) === 'SKILL.md');
  if (skillMarkdownFiles.length === 0) {
    addIssue(preview.errors, 'SKILL_MD_REQUIRED', 'ZIP 需要包含 SKILL.md。');
    return { preview, entries: [] };
  }

  if (skillMarkdownFiles.length > 1) {
    addIssue(preview.errors, 'MULTIPLE_SKILL_DEFINITIONS', 'ZIP 中包含多个 SKILL.md，无法判断要导入哪一个 Skill。');
    return { preview, entries: [] };
  }

  const skillMarkdownPath = skillMarkdownFiles[0]?.name ?? '';
  const skillParent = path.posix.dirname(skillMarkdownPath);
  const rootPrefix = skillParent === '.' ? '' : `${skillParent}/`;
  const rawDirectory = rootPrefix ? rootPrefix.split('/')[0] ?? '' : zipDirectoryFromName(originalName);

  let directory = '';
  try {
    directory = normalizeDirectory(rawDirectory);
  } catch {
    addIssue(preview.errors, 'INVALID_SKILL_DIRECTORY', 'Skill 目录名不合法。');
  }

  if (!directory) {
    return { preview, entries: [] };
  }

  const id = skillIdFromDirectory(directory);
  const managedConflict = unifiedSkillsDb.get(id) !== null || await pathExists(path.join(managedSkillRoot(), directory));
  const appConflicts = await appConflictsForDirectory(directory);
  const warnings: UnifiedSkillZipValidationIssue[] = [];
  if (appConflicts.length > 0) {
    addIssue(warnings, 'APP_SKILL_EXISTS', '应用目录已有同名 Skill，导入时不会覆盖这些目录。');
  }

  const skillMarkdownEntry = skillMarkdownFiles[0];
  let meta = { name: directory, description: '' };
  try {
    const skillMarkdown = await skillMarkdownEntry.async('string');
    meta = readProviderSkillMarkdownDefinitionFromContent(skillMarkdown, directory);
  } catch {
    addIssue(preview.errors, 'INVALID_SKILL_MD', 'SKILL.md 元数据无法解析。');
  }

  if (managedConflict) {
    addIssue(preview.errors, 'MANAGED_SKILL_EXISTS', '已存在同名托管 Skill。');
  }

  const entries: ZipSkillEntry[] = [];
  if (preview.errors.length === 0) {
    for (const entry of files) {
      if (rootPrefix && !entry.name.startsWith(rootPrefix)) {
        continue;
      }

      const relativePath = rootPrefix ? entry.name.slice(rootPrefix.length) : entry.name;
      if (!relativePath || unsafeZipPath(relativePath)) {
        addIssue(preview.errors, 'UNSAFE_ZIP_PATH', `ZIP 内存在不安全路径：${entry.name}`);
        continue;
      }

      entries.push({
        originalPath: entry.name,
        relativePath,
        content: await entry.async('nodebuffer'),
      });
    }
  }

  return {
    preview: {
      valid: preview.errors.length === 0 && !managedConflict,
      directory,
      id,
      name: meta.name,
      description: meta.description,
      rootPrefix: rootPrefix || undefined,
      warnings,
      errors: preview.errors,
      conflicts: {
        managed: managedConflict,
        apps: appConflicts,
      },
    },
    entries,
  };
};

const writeZipEntriesToDirectory = async (targetDir: string, entries: ZipSkillEntry[]): Promise<void> => {
  const root = path.resolve(targetDir);
  for (const entry of entries) {
    const outputPath = path.resolve(root, entry.relativePath);
    if (outputPath !== root && !outputPath.startsWith(`${root}${path.sep}`)) {
      throw new AppError('ZIP entry path is unsafe.', {
        code: 'UNSAFE_ZIP_PATH',
        statusCode: 400,
      });
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, entry.content);
  }
};

export const unifiedSkillsService = {
  async previewZip(buffer: Buffer, originalName: string): Promise<UnifiedSkillZipPreview> {
    return (await parseZipSkill(buffer, originalName)).preview;
  },

  async importFromZip(input: ImportZipSkillInput): Promise<{ skill: UnifiedSkill; warnings: UnifiedSkillZipValidationIssue[] }> {
    const parsed = await parseZipSkill(input.buffer, input.originalName);
    if (!parsed.preview.valid) {
      throw new AppError(
        parsed.preview.conflicts.managed ? 'Managed skill already exists.' : 'Skill ZIP is invalid.',
        {
          code: parsed.preview.conflicts.managed ? 'MANAGED_SKILL_EXISTS' : 'INVALID_SKILL_ZIP',
          statusCode: parsed.preview.conflicts.managed ? 409 : 400,
          details: { preview: parsed.preview },
        },
      );
    }

    const importsRoot = path.join(managedSkillRoot(), '.imports');
    const stagingDir = path.join(importsRoot, randomUUID());
    const stagedSkillDir = path.join(stagingDir, parsed.preview.directory);
    const targetPath = path.join(managedSkillRoot(), parsed.preview.directory);

    try {
      await fs.mkdir(stagedSkillDir, { recursive: true });
      await writeZipEntriesToDirectory(stagedSkillDir, parsed.entries);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.rename(stagedSkillDir, targetPath);

      const saved = unifiedSkillsDb.save({
        id: parsed.preview.id,
        name: parsed.preview.name,
        description: parsed.preview.description,
        directory: parsed.preview.directory,
        sourcePath: targetPath,
        enabled: input.enabled,
      });

      for (const app of UNIFIED_SKILL_APPS) {
        if (saved.enabled[app]) {
          await syncToApp(saved, app);
        }
      }

      return { skill: saved, warnings: parsed.preview.warnings };
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code === 'EEXIST') {
        throw new AppError('Managed skill already exists.', {
          code: 'MANAGED_SKILL_EXISTS',
          statusCode: 409,
          details: { preview: parsed.preview },
        });
      }
      throw error;
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  },

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
