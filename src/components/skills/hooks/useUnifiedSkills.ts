import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';
import type { ApiResponse, UnifiedSkill, UnifiedSkillApp, UnifiedSkillAppStates, UnmanagedSkill } from '../types';

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

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const enabledFromFoundIn = (skill: UnmanagedSkill): UnifiedSkillAppStates => ({
  claude: skill.foundIn.includes('claude'),
  codex: skill.foundIn.includes('codex'),
  gemini: skill.foundIn.includes('gemini'),
  cursor: skill.foundIn.includes('cursor'),
});

export function useUnifiedSkills() {
  const [skills, setSkills] = useState<UnifiedSkill[]>([]);
  const [unmanagedSkills, setUnmanagedSkills] = useState<UnmanagedSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
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
    loadError,
    saveStatus,
    refreshSkills,
    scanUnmanaged,
    importSkill,
    toggleApp,
    deleteSkill,
  };
}
