import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { configSyncBackupsDb, getDatabasePath } from '@/modules/database/index.js';
import type { BackupResult, ConfigCenterAppType } from '@/modules/config-center/config-center.types.js';

const toTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export async function backupFileIfExists(
  appType: ConfigCenterAppType,
  targetType: string,
  filePath: string,
): Promise<BackupResult | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  const backupRoot = path.join(
    path.dirname(getDatabasePath()),
    'config-center-backups',
    appType,
    targetType,
  );
  await mkdir(backupRoot, { recursive: true });

  const backupPath = path.join(backupRoot, `${toTimestamp()}-${path.basename(filePath)}`);
  await copyFile(filePath, backupPath);

  const record = configSyncBackupsDb.create({
    id: crypto.randomUUID(),
    appType,
    targetType,
    filePath,
    backupPath,
  });

  return {
    id: record.id,
    filePath: record.filePath,
    backupPath: record.backupPath,
    createdAt: record.createdAt,
  };
}
