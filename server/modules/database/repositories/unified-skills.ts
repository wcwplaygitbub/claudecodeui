import { getConnection } from '@/modules/database/connection.js';
import type {
  SaveUnifiedSkillInput,
  UnifiedSkill,
  UnifiedSkillApp,
  UnifiedSkillSyncRecord,
} from '@/modules/unified-skills/index.js';

export type UnifiedSkillRow = {
  id: string;
  name: string;
  description: string;
  directory: string;
  source_path: string;
  enabled_claude: number;
  enabled_codex: number;
  enabled_gemini: number;
  enabled_cursor: number;
  created_at: string;
  updated_at: string;
};

export type UnifiedSkillSyncRow = {
  skill_id: string;
  app: UnifiedSkillApp;
  target_path: string;
  created_at: string;
};

const mapSkillRow = (row: UnifiedSkillRow): UnifiedSkill => ({
  id: row.id,
  name: row.name,
  description: row.description,
  directory: row.directory,
  sourcePath: row.source_path,
  enabled: {
    claude: row.enabled_claude === 1,
    codex: row.enabled_codex === 1,
    gemini: row.enabled_gemini === 1,
    cursor: row.enabled_cursor === 1,
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSyncRow = (row: UnifiedSkillSyncRow): UnifiedSkillSyncRecord => ({
  skillId: row.skill_id,
  app: row.app,
  targetPath: row.target_path,
  createdAt: row.created_at,
});

export const unifiedSkillsDb = {
  list(): UnifiedSkill[] {
    const db = getConnection();
    const rows = db
      .prepare('SELECT * FROM unified_skills ORDER BY name COLLATE NOCASE ASC')
      .all() as UnifiedSkillRow[];
    return rows.map(mapSkillRow);
  },

  get(id: string): UnifiedSkill | null {
    const db = getConnection();
    const row = db.prepare('SELECT * FROM unified_skills WHERE id = ?').get(id) as UnifiedSkillRow | undefined;
    return row ? mapSkillRow(row) : null;
  },

  save(input: SaveUnifiedSkillInput): UnifiedSkill {
    const db = getConnection();
    db.prepare(
      `INSERT INTO unified_skills (
        id, name, description, directory, source_path,
        enabled_claude, enabled_codex, enabled_gemini, enabled_cursor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        directory = excluded.directory,
        source_path = excluded.source_path,
        enabled_claude = excluded.enabled_claude,
        enabled_codex = excluded.enabled_codex,
        enabled_gemini = excluded.enabled_gemini,
        enabled_cursor = excluded.enabled_cursor,
        updated_at = CURRENT_TIMESTAMP`,
    ).run(
      input.id,
      input.name,
      input.description,
      input.directory,
      input.sourcePath,
      input.enabled.claude ? 1 : 0,
      input.enabled.codex ? 1 : 0,
      input.enabled.gemini ? 1 : 0,
      input.enabled.cursor ? 1 : 0,
    );

    const saved = unifiedSkillsDb.get(input.id);
    if (!saved) {
      throw new Error('Failed to save unified skill');
    }
    return saved;
  },

  delete(id: string): boolean {
    const db = getConnection();
    const result = db.prepare('DELETE FROM unified_skills WHERE id = ?').run(id);
    return result.changes > 0;
  },

  getSync(skillId: string, app: UnifiedSkillApp): UnifiedSkillSyncRecord | null {
    const db = getConnection();
    const row = db
      .prepare('SELECT * FROM unified_skill_app_syncs WHERE skill_id = ? AND app = ?')
      .get(skillId, app) as UnifiedSkillSyncRow | undefined;
    return row ? mapSyncRow(row) : null;
  },

  saveSync(skillId: string, app: UnifiedSkillApp, targetPath: string): UnifiedSkillSyncRecord {
    const db = getConnection();
    db.prepare(
      `INSERT INTO unified_skill_app_syncs (skill_id, app, target_path)
       VALUES (?, ?, ?)
       ON CONFLICT(skill_id, app) DO UPDATE SET
         target_path = excluded.target_path`,
    ).run(skillId, app, targetPath);
    const saved = unifiedSkillsDb.getSync(skillId, app);
    if (!saved) {
      throw new Error('Failed to save unified skill sync');
    }
    return saved;
  },

  deleteSync(skillId: string, app: UnifiedSkillApp): boolean {
    const db = getConnection();
    const result = db.prepare('DELETE FROM unified_skill_app_syncs WHERE skill_id = ? AND app = ?').run(skillId, app);
    return result.changes > 0;
  },
};
