export type UnifiedSkillApp = 'claude' | 'codex';

export const UNIFIED_SKILL_APPS: UnifiedSkillApp[] = ['claude', 'codex'];

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

export type UnifiedSkillZipValidationIssue = {
  code: string;
  message: string;
};

export type UnifiedSkillZipPreview = {
  valid: boolean;
  directory: string;
  id: string;
  name: string;
  description: string;
  rootPrefix?: string;
  warnings: UnifiedSkillZipValidationIssue[];
  errors: UnifiedSkillZipValidationIssue[];
  conflicts: {
    managed: boolean;
    apps: UnifiedSkillApp[];
  };
};

export type ImportZipSkillInput = {
  buffer: Buffer;
  originalName: string;
  enabled: UnifiedSkillAppStates;
};
