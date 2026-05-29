export type UnifiedSkillApp = 'claude' | 'codex';

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

export type UnmanagedSkill = {
  directory: string;
  name: string;
  description: string;
  foundIn: UnifiedSkillApp[];
  path: string;
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

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
