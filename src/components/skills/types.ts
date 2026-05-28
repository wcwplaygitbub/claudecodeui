export type UnifiedSkillApp = 'claude' | 'codex' | 'gemini' | 'cursor';

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
