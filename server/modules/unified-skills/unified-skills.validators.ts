import { AppError } from '@/shared/utils.js';
import type { UnifiedSkillApp, UnifiedSkillAppStates } from './unified-skills.types.js';
import { UNIFIED_SKILL_APPS } from './unified-skills.types.js';

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const readEnabled = (value: unknown): UnifiedSkillAppStates => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    claude: record.claude === true,
    codex: record.codex === true,
  };
};

export const parseSkillZipEnabledPayload = (value: unknown): UnifiedSkillAppStates => {
  if (value === undefined || value === null || value === '') {
    return readEnabled(undefined);
  }

  if (typeof value !== 'string') {
    return readEnabled(value);
  }

  try {
    return readEnabled(JSON.parse(value) as unknown);
  } catch {
    throw new AppError('enabled must be valid JSON.', {
      code: 'INVALID_ENABLED_PAYLOAD',
      statusCode: 400,
    });
  }
};

export const parseUnifiedSkillApp = (value: unknown): UnifiedSkillApp => {
  if (typeof value === 'string' && UNIFIED_SKILL_APPS.includes(value as UnifiedSkillApp)) {
    return value as UnifiedSkillApp;
  }

  throw new AppError('Unsupported unified skill app.', {
    code: 'UNSUPPORTED_UNIFIED_SKILL_APP',
    statusCode: 400,
  });
};

export const parseSkillImportPayload = (payload: unknown): Array<{ directory: string; enabled: UnifiedSkillAppStates }> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Request body must be an object.', {
      code: 'INVALID_REQUEST_BODY',
      statusCode: 400,
    });
  }

  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.skills)) {
    throw new AppError('skills must be an array.', {
      code: 'INVALID_SKILLS_IMPORT_PAYLOAD',
      statusCode: 400,
    });
  }

  return body.skills.map((entry) => {
    const record = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : null;
    const directory = readString(record?.directory);
    if (!directory) {
      throw new AppError('skill directory is required.', {
        code: 'SKILL_DIRECTORY_REQUIRED',
        statusCode: 400,
      });
    }

    return {
      directory,
      enabled: readEnabled(record?.enabled),
    };
  });
};
