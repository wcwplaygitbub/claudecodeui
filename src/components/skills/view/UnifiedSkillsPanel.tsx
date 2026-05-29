import { useState } from 'react';
import { Download, Search, Sparkles, Trash2, Upload } from 'lucide-react';

import { Badge, Button } from '../../../shared/view/ui';
import { cn } from '../../../lib/utils';
import { useUnifiedSkills } from '../hooks/useUnifiedSkills';
import type { UnifiedSkillApp } from '../types';
import ManualSkillImportDialog from './ManualSkillImportDialog';

const UNIFIED_SKILL_APPS: Array<{ id: UnifiedSkillApp; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
];

export default function UnifiedSkillsPanel() {
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const {
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
    scanUnmanaged,
    importSkill,
    toggleApp,
    deleteSkill,
    previewZipSkill,
    importZipSkill,
    clearZipPreview,
  } = useUnifiedSkills();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-purple-500" />
        <h3 className="text-lg font-medium text-foreground">Skills 管理</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        统一管理 Claude、Codex 的 Skills。扫描范围：~/.claude/skills、~/.agents/skills。同步策略是 merge-only：目标应用已有同名 skill 时不会覆盖，关闭时只删除本工具创建的同步副本。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void scanUnmanaged()} variant="outline" size="sm" disabled={isScanning}>
          <Search className="mr-2 h-4 w-4" />
          {isScanning ? '扫描中...' : '扫描应用 Skills'}
        </Button>
        <Button onClick={() => setManualImportOpen(true)} variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          手动导入 ZIP
        </Button>
        {saveStatus === 'success' && (
          <span className="animate-in fade-in text-xs text-muted-foreground">已保存</span>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
          {loadError}
        </div>
      )}

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">已管理 Skills</h4>
        {isLoading && skills.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">正在加载 Skills...</div>
        )}

        {skills.map((skill) => (
          <div key={skill.id} className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{skill.name}</span>
                  <Badge variant="outline" className="text-xs">{skill.directory}</Badge>
                </div>
                {skill.description && <p className="text-sm text-muted-foreground">{skill.description}</p>}
                <div className="break-all text-xs text-muted-foreground">{skill.sourcePath}</div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {UNIFIED_SKILL_APPS.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => void toggleApp(skill, app.id, !skill.enabled[app.id])}
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs transition-colors',
                        skill.enabled[app.id]
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {app.label}: {skill.enabled[app.id] ? '开' : '关'}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => void deleteSkill(skill)}
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                title="删除托管 Skill"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {!isLoading && skills.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            还没有托管的 Skills。可以扫描应用 Skills，也可以手动导入 ZIP。
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">未管理 Skills</h4>
        {unmanagedSkills.map((skill) => (
          <div key={skill.directory} className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{skill.name}</span>
                  <Badge variant="outline" className="text-xs">{skill.directory}</Badge>
                  {skill.foundIn.map((app) => (
                    <Badge key={app} variant="outline" className="text-xs">{app}</Badge>
                  ))}
                </div>
                {skill.description && <p className="text-sm text-muted-foreground">{skill.description}</p>}
                <div className="break-all text-xs text-muted-foreground">{skill.path}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void importSkill(skill)} variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  导入统一管理
                </Button>
              </div>
            </div>
          </div>
        ))}

        {!isScanning && unmanagedSkills.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            点击“扫描应用 Skills”查找各应用目录中尚未托管的 Skills。
          </div>
        )}
      </section>

      <ManualSkillImportDialog
        open={manualImportOpen}
        onOpenChange={setManualImportOpen}
        preview={zipPreview}
        isPreviewing={isPreviewingZip}
        isImporting={isImportingZip}
        error={zipImportError}
        onPreview={previewZipSkill}
        onImport={importZipSkill}
        onClear={clearZipPreview}
      />
    </div>
  );
}
