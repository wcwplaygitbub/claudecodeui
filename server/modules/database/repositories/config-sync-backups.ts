import { getConnection } from '@/modules/database/connection.js';

export type ConfigSyncBackup = {
  id: string;
  appType: string;
  targetType: string;
  filePath: string;
  backupPath: string;
  createdAt: string;
};

type ConfigSyncBackupRow = {
  id: string;
  app_type: string;
  target_type: string;
  file_path: string;
  backup_path: string;
  created_at: string;
};

export type CreateConfigSyncBackupInput = {
  id: string;
  appType: string;
  targetType: string;
  filePath: string;
  backupPath: string;
};

const mapRow = (row: ConfigSyncBackupRow): ConfigSyncBackup => ({
  id: row.id,
  appType: row.app_type,
  targetType: row.target_type,
  filePath: row.file_path,
  backupPath: row.backup_path,
  createdAt: row.created_at,
});

export const configSyncBackupsDb = {
  create(input: CreateConfigSyncBackupInput): ConfigSyncBackup {
    const db = getConnection();
    db.prepare(
      `INSERT INTO config_sync_backups (id, app_type, target_type, file_path, backup_path)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.id, input.appType, input.targetType, input.filePath, input.backupPath);

    const row = db
      .prepare('SELECT * FROM config_sync_backups WHERE id = ?')
      .get(input.id) as ConfigSyncBackupRow | undefined;
    if (!row) {
      throw new Error('Failed to create config sync backup record');
    }
    return mapRow(row);
  },

  list(appType?: string): ConfigSyncBackup[] {
    const db = getConnection();
    const rows = appType
      ? db
        .prepare(
          `SELECT * FROM config_sync_backups
           WHERE app_type = ?
           ORDER BY datetime(created_at) DESC`,
        )
        .all(appType)
      : db
        .prepare('SELECT * FROM config_sync_backups ORDER BY datetime(created_at) DESC')
        .all();
    return (rows as ConfigSyncBackupRow[]).map(mapRow);
  },
};
