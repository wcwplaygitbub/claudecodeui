export type ConfigCenterAppType = 'claude';

export type ConfigProvider = {
  id: string;
  appType: ConfigCenterAppType;
  name: string;
  settingsConfig: Record<string, unknown>;
  category: string | null;
  websiteUrl: string | null;
  notes: string | null;
  icon: string | null;
  iconColor: string | null;
  meta: Record<string, unknown>;
  isCurrent: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BackupResult = {
  id: string;
  filePath: string;
  backupPath: string;
  createdAt: string;
};

export type ApplyProviderResult = {
  appType: ConfigCenterAppType;
  providerId: string;
  writtenFiles: string[];
  backups: BackupResult[];
};
