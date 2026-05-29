import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';
import type { ApiResponse, UnifiedSkill, UnifiedSkillApp, UnifiedSkillAppStates, UnifiedSkillZipPreview, UnmanagedSkill } from '../types';

const readJson = async <T,>(response: Response): Promise<T> => response.json() as Promise<T>;

const getApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;

  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

const getApiErrorPreview = (payload: unknown): UnifiedSkillZipPreview | null => {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return null;
  const details = (error as Record<string, unknown>).details;
  if (!details || typeof details !== 'object') return null;
  const preview = (details as Record<string, unknown>).preview;
  return preview && typeof preview === 'object' ? preview as UnifiedSkillZipPreview : null;
};

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const enabledFromFoundIn = (skill: UnmanagedSkill): UnifiedSkillAppStates => ({
  claude: skill.foundIn.includes('claude'),
  codex: skill.foundIn.includes('codex'),
});

export function useUnifiedSkills() {
  const [skills, setSkills] = useState<UnifiedSkill[]>([]);
  const [unmanagedSkills, setUnmanagedSkills] = useState<UnmanagedSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewingZip, setIsPreviewingZip] = useState(false);
  const [isImportingZip, setIsImportingZip] = useState(false);
  const [zipPreview, setZipPreview] = useState<UnifiedSkillZipPreview | null>(null);
  const [zipImportError, setZipImportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

  const refreshSkills = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await authenticatedFetch('/api/unified-skills/skills');
      const data = await readJson<ApiResponse<{ skills: UnifiedSkill[] }>>(response);
      if (!response.ok || !data.success) {
        throw new Error(getApiErrorMessage(data, 'Failed to load skills'));
      }
      setSkills(data.data.skills);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanUnmanaged = useCallback(async () => {
    setIsScanning(true);
    setLoadError(null);
    try {
      const response = await authenticatedFetch('/api/unified-skills/unmanaged');
      const data = await readJson<ApiResponse<{ skills: UnmanagedSkill[] }>>(response);
      if (!response.ok || !data.success) {
        throw new Error(getApiErrorMessage(data, 'Failed to scan skills'));
      }
      setUnmanagedSkills(data.data.skills);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsScanning(false);
    }
  }, []);

  const importSkill = useCallback(async (skill: UnmanagedSkill) => {
    const response = await authenticatedFetch('/api/unified-skills/import', {
      method: 'POST',
      body: JSON.stringify({
        skills: [{ directory: skill.directory, enabled: enabledFromFoundIn(skill) }],
      }),
    });
    const data = await readJson<ApiResponse<{ imported: number; skills: UnifiedSkill[] }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to import skill'));
    }
    await refreshSkills();
    await scanUnmanaged();
    setSaveStatus('success');
  }, [refreshSkills, scanUnmanaged]);

  const toggleApp = useCallback(async (skill: UnifiedSkill, app: UnifiedSkillApp, enabled: boolean) => {
    const response = await authenticatedFetch(`/api/unified-skills/skills/${encodeURIComponent(skill.id)}/apps/${app}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    const data = await readJson<ApiResponse<{ skill: UnifiedSkill }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to update skill'));
    }
    await refreshSkills();
    setSaveStatus('success');
  }, [refreshSkills]);

  const deleteSkill = useCallback(async (skill: UnifiedSkill) => {
    const confirmed = window.confirm(
      `确认删除 Skill「${skill.name}」？\n\n将删除统一管理记录、~/.cloudcli/unified-skills/${skill.directory} 中的中心副本，以及本工具同步到各应用的副本。不会删除非本工具管理的应用 Skill。`,
    );
    if (!confirmed) return;

    const response = await authenticatedFetch(`/api/unified-skills/skills/${encodeURIComponent(skill.id)}`, {
      method: 'DELETE',
    });
    const data = await readJson<ApiResponse<{ deleted: boolean }>>(response);
    if (!response.ok || !data.success) {
      setSaveStatus('error');
      throw new Error(getApiErrorMessage(data, 'Failed to delete skill'));
    }
    await refreshSkills();
    await scanUnmanaged();
    setSaveStatus('success');
  }, [refreshSkills, scanUnmanaged]);

  const clearZipPreview = useCallback(() => {
    setZipPreview(null);
    setZipImportError(null);
  }, []);

  const previewZipSkill = useCallback(async (file: File): Promise<UnifiedSkillZipPreview> => {
    setIsPreviewingZip(true);
    setZipImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authenticatedFetch('/api/unified-skills/import/zip/preview', {
        method: 'POST',
        body: formData,
        headers: {},
      });
      const data = await readJson<ApiResponse<{ preview: UnifiedSkillZipPreview }>>(response);
      if (!response.ok || !data.success) {
        throw new Error(getApiErrorMessage(data, 'Failed to check ZIP'));
      }
      setZipPreview(data.data.preview);
      return data.data.preview;
    } catch (error) {
      const message = getErrorMessage(error);
      setZipImportError(message);
      throw error;
    } finally {
      setIsPreviewingZip(false);
    }
  }, []);

  const importZipSkill = useCallback(async (file: File, enabled: UnifiedSkillAppStates): Promise<void> => {
    setIsImportingZip(true);
    setZipImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('enabled', JSON.stringify(enabled));
      const response = await authenticatedFetch('/api/unified-skills/import/zip', {
        method: 'POST',
        body: formData,
        headers: {},
      });
      const data = await readJson<ApiResponse<{ skill: UnifiedSkill; warnings: unknown[] }>>(response);
      if (!response.ok || !data.success) {
        const preview = getApiErrorPreview(data);
        if (preview) setZipPreview(preview);
        throw new Error(getApiErrorMessage(data, 'Failed to import ZIP'));
      }
      await refreshSkills();
      setZipPreview(null);
      setSaveStatus('success');
    } catch (error) {
      const message = getErrorMessage(error);
      setZipImportError(message);
      setSaveStatus('error');
      throw error;
    } finally {
      setIsImportingZip(false);
    }
  }, [refreshSkills]);

  useEffect(() => {
    void refreshSkills();
  }, [refreshSkills]);

  useEffect(() => {
    if (saveStatus === null) return;
    const timer = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  return {
    skills,
    unmanagedSkills,
    isLoading,
    isScanning,
    isPreviewingZip,
    isImportingZip,
    zipPreview,
    zipImportError,
    loadError,
    saveStatus,
    refreshSkills,
    scanUnmanaged,
    importSkill,
    toggleApp,
    deleteSkill,
    previewZipSkill,
    importZipSkill,
    clearZipPreview,
  };
}
