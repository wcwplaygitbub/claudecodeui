import { getConnection } from '@/modules/database/connection.js';

export type ConfigProviderRow = {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
  category: string | null;
  website_url: string | null;
  notes: string | null;
  icon: string | null;
  icon_color: string | null;
  meta: string | null;
  is_current: number;
  created_at: string;
  updated_at: string;
};

export type ConfigProvider = {
  id: string;
  appType: string;
  name: string;
  settingsConfig: Record<string, unknown>;
  category: string | null;
  websiteUrl: string | null;
  notes: string | null;
  icon: string | null;
  iconColor: string | null;
  meta: Record<string, unknown>;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveConfigProviderInput = {
  id: string;
  appType: string;
  name: string;
  settingsConfig: Record<string, unknown>;
  category?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  icon?: string | null;
  iconColor?: string | null;
  meta?: Record<string, unknown> | null;
};

const parseJsonObject = (value: string | null, fallback: Record<string, unknown>): Record<string, unknown> => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const mapRow = (row: ConfigProviderRow): ConfigProvider => ({
  id: row.id,
  appType: row.app_type,
  name: row.name,
  settingsConfig: parseJsonObject(row.settings_config, {}),
  category: row.category,
  websiteUrl: row.website_url,
  notes: row.notes,
  icon: row.icon,
  iconColor: row.icon_color,
  meta: parseJsonObject(row.meta, {}),
  isCurrent: row.is_current === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const configProvidersDb = {
  list(appType: string): ConfigProvider[] {
    const db = getConnection();
    const rows = db
      .prepare(
        `SELECT * FROM config_providers
         WHERE app_type = ?
         ORDER BY is_current DESC, datetime(updated_at) DESC, name ASC`,
      )
      .all(appType) as ConfigProviderRow[];
    return rows.map(mapRow);
  },

  get(appType: string, id: string): ConfigProvider | null {
    const db = getConnection();
    const row = db
      .prepare('SELECT * FROM config_providers WHERE app_type = ? AND id = ?')
      .get(appType, id) as ConfigProviderRow | undefined;
    return row ? mapRow(row) : null;
  },

  getCurrent(appType: string): ConfigProvider | null {
    const db = getConnection();
    const row = db
      .prepare(
        `SELECT * FROM config_providers
         WHERE app_type = ? AND is_current = 1
         ORDER BY datetime(updated_at) DESC
         LIMIT 1`,
      )
      .get(appType) as ConfigProviderRow | undefined;
    return row ? mapRow(row) : null;
  },

  create(input: SaveConfigProviderInput): ConfigProvider {
    const db = getConnection();
    db.prepare(
      `INSERT INTO config_providers (
        id, app_type, name, settings_config, category, website_url, notes, icon, icon_color, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.appType,
      input.name,
      JSON.stringify(input.settingsConfig),
      input.category ?? null,
      input.websiteUrl ?? null,
      input.notes ?? null,
      input.icon ?? null,
      input.iconColor ?? null,
      JSON.stringify(input.meta ?? {}),
    );

    const created = configProvidersDb.get(input.appType, input.id);
    if (!created) {
      throw new Error('Failed to create config provider');
    }
    return created;
  },

  update(appType: string, id: string, input: Omit<SaveConfigProviderInput, 'appType' | 'id'>): ConfigProvider {
    const db = getConnection();
    const result = db.prepare(
      `UPDATE config_providers
       SET name = ?, settings_config = ?, category = ?, website_url = ?, notes = ?, icon = ?, icon_color = ?, meta = ?, updated_at = CURRENT_TIMESTAMP
       WHERE app_type = ? AND id = ?`,
    ).run(
      input.name,
      JSON.stringify(input.settingsConfig),
      input.category ?? null,
      input.websiteUrl ?? null,
      input.notes ?? null,
      input.icon ?? null,
      input.iconColor ?? null,
      JSON.stringify(input.meta ?? {}),
      appType,
      id,
    );

    if (result.changes === 0) {
      throw new Error('Config provider not found');
    }

    const updated = configProvidersDb.get(appType, id);
    if (!updated) {
      throw new Error('Failed to update config provider');
    }
    return updated;
  },

  delete(appType: string, id: string): boolean {
    const db = getConnection();
    const result = db
      .prepare('DELETE FROM config_providers WHERE app_type = ? AND id = ?')
      .run(appType, id);
    return result.changes > 0;
  },

  setCurrent(appType: string, id: string): void {
    const db = getConnection();
    const transaction = db.transaction(() => {
      db.prepare('UPDATE config_providers SET is_current = 0 WHERE app_type = ?').run(appType);
      const result = db
        .prepare(
          `UPDATE config_providers
           SET is_current = 1, updated_at = CURRENT_TIMESTAMP
           WHERE app_type = ? AND id = ?`,
        )
        .run(appType, id);

      if (result.changes === 0) {
        throw new Error('Config provider not found');
      }
    });
    transaction();
  },
};
