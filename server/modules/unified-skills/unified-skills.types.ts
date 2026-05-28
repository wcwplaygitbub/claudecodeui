export type UnifiedSkillApp = 'claude' | 'codex' | 'gemini' | 'cursor';

export const UNIFIED_SKILL_APPS: UnifiedSkillApp[] = ['claude', 'codex', 'gemini', 'cursor'];

export type UnifiedSkillAppStates = Record<UnifiedSkillApp, boolean>;

export type UnifiedSkill = {
  id: string;
  name: string;
  description: string;
  directory: string;
  sourcePath: string;
  enabled: UnifiedSkillAppStates;
  createdAt: string;
  updatedAt: string;
};

export type SaveUnifiedSkillInput = {
  id: string;
  name: string;
  description: string;
  directory: string;
  sourcePath: string;
  enabled: UnifiedSkillAppStates;
};

export type UnifiedSkillSyncRecord = {
  skillId: string;
  app: UnifiedSkillApp;
  targetPath: string;
  createdAt: string;
};
