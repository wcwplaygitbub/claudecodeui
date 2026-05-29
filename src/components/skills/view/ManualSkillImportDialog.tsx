import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileArchive } from 'lucide-react';

import { Badge, Button, Dialog, DialogContent, DialogTitle, Input } from '../../../shared/view/ui';
import type { UnifiedSkillApp, UnifiedSkillAppStates, UnifiedSkillZipPreview } from '../types';

const UNIFIED_SKILL_APPS: Array<{ id: UnifiedSkillApp; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
];

const emptyEnabled = (): UnifiedSkillAppStates => ({
  claude: false,
  codex: false,
});

type ManualSkillImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: UnifiedSkillZipPreview | null;
  isPreviewing: boolean;
  isImporting: boolean;
  error: string | null;
  onPreview: (file: File) => Promise<UnifiedSkillZipPreview>;
  onImport: (file: File, enabled: UnifiedSkillAppStates) => Promise<void>;
  onClear: () => void;
};

export default function ManualSkillImportDialog({
  open,
  onOpenChange,
  preview,
  isPreviewing,
  isImporting,
  error,
  onPreview,
  onImport,
  onClear,
}: ManualSkillImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [enabled, setEnabled] = useState<UnifiedSkillAppStates>(emptyEnabled);

  const reset = () => {
    setFile(null);
    setEnabled(emptyEnabled());
    onClear();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    onClear();
  };

  const handlePreview = async () => {
    if (!file) return;
    await onPreview(file).catch(() => undefined);
  };

  const handleImport = async () => {
    if (!file || !preview?.valid) return;
    await onImport(file, enabled);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl p-6">
        <DialogTitle>手动导入 Skill ZIP</DialogTitle>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <FileArchive className="h-5 w-5 text-purple-500" />
            <div>
              <h3 className="text-lg font-medium text-foreground">手动导入 Skill ZIP</h3>
              <p className="text-sm text-muted-foreground">
                ZIP 需要包含 SKILL.md。导入不会覆盖已有同名 Skill。
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={handleFileChange} />
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!file || isPreviewing || isImporting}>
                {isPreviewing ? '检查中...' : '检查 ZIP'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-start gap-2">
                {preview.valid ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{preview.name || preview.directory || '未识别 Skill'}</span>
                    {preview.directory && <Badge variant="outline" className="text-xs">{preview.directory}</Badge>}
                  </div>
                  {preview.description && <p className="text-sm text-muted-foreground">{preview.description}</p>}
                  {preview.rootPrefix && (
                    <p className="text-xs text-muted-foreground">ZIP 根目录：{preview.rootPrefix}</p>
                  )}
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="space-y-1 text-sm text-red-700 dark:text-red-200">
                  {preview.errors.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`}>• {issue.message}</div>
                  ))}
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="space-y-1 text-sm text-amber-700 dark:text-amber-200">
                  {preview.warnings.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`}>• {issue.message}</div>
                  ))}
                </div>
              )}

              {preview.conflicts.apps.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  应用目录已有同名 Skill，将保留原目录：{preview.conflicts.apps.join(', ')}
                </div>
              )}

              {preview.valid && (
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="text-sm font-medium text-foreground">导入后启用到</div>
                  <div className="flex flex-wrap gap-2">
                    {UNIFIED_SKILL_APPS.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setEnabled((current) => ({ ...current, [app.id]: !current[app.id] }))}
                        className={enabled[app.id]
                          ? 'rounded-md border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors'
                          : 'rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent'}
                      >
                        {app.label}: {enabled[app.id] ? '开' : '关'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={isImporting}>
              取消
            </Button>
            <Button type="button" onClick={handleImport} disabled={!file || !preview?.valid || isImporting || isPreviewing}>
              {isImporting ? '导入中...' : '确认导入'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
