import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Copy, Download, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { api } from '../../../utils/api';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../../../shared/view/ui';
import ProviderFormModal, { type ProviderFormValues } from './ProviderFormModal';
import {
  claudeFormValuesToPayload,
  providerToClaudeFormValues,
  type ConfigProvider,
} from './claudeProviderFormUtils';

const APP_TYPE = 'claude';

const readError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    return data.error || data.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

export default function ProviderCenter() {
  const { t } = useTranslation('settings');
  const [providers, setProviders] = useState<ConfigProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ConfigProvider | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [importId, setImportId] = useState('current-claude');
  const [importName, setImportName] = useState('Current Claude Config');

  const currentProvider = useMemo(() => providers.find((provider) => provider.isCurrent), [providers]);
  const formInitialValues = useMemo(
    () => editingProvider ? providerToClaudeFormValues(editingProvider) : undefined,
    [editingProvider],
  );

  const loadProviders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.configCenter.providers.list(APP_TYPE);
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setProviders(data.data?.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  const handleSubmit = async (values: ProviderFormValues) => {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = claudeFormValuesToPayload(values);
      const response = editingProvider
        ? await api.configCenter.providers.update(APP_TYPE, editingProvider.id, payload)
        : await api.configCenter.providers.create(APP_TYPE, payload);
      if (!response.ok) throw new Error(await readError(response));
      setIsFormOpen(false);
      setEditingProvider(null);
      setMessage(editingProvider ? t('configCenter.providers.messages.updated') : t('configCenter.providers.messages.created'));
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async (provider: ConfigProvider) => {
    const confirmed = window.confirm(
      t('configCenter.providers.confirmApply'),
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    try {
      const response = await api.configCenter.providers.apply(APP_TYPE, provider.id);
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      const writtenFiles = data.data?.result?.writtenFiles || [];
      setMessage(t('configCenter.providers.messages.applied', { files: writtenFiles.join(', ') || '~/.claude/settings.json' }));
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (provider: ConfigProvider) => {
    if (!window.confirm(t('configCenter.providers.confirmDelete', { name: provider.name }))) return;
    setError(null);
    setMessage(null);
    try {
      const response = await api.configCenter.providers.delete(APP_TYPE, provider.id);
      if (!response.ok) throw new Error(await readError(response));
      setMessage(t('configCenter.providers.messages.deleted'));
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDuplicate = async (provider: ConfigProvider) => {
    const id = window.prompt(t('configCenter.providers.duplicateIdPrompt'), `${provider.id}-copy`);
    if (!id) return;
    const name = window.prompt(t('configCenter.providers.duplicateNamePrompt'), `${provider.name} Copy`);
    if (!name) return;
    setError(null);
    setMessage(null);
    try {
      const response = await api.configCenter.providers.duplicate(APP_TYPE, provider.id, { id, name });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(t('configCenter.providers.messages.duplicated'));
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportCurrent = async () => {
    setError(null);
    setMessage(null);
    try {
      const response = await api.configCenter.providers.importCurrent(APP_TYPE, {
        id: importId,
        name: importName,
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(t('configCenter.providers.messages.imported'));
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t('configCenter.providers.title')}</CardTitle>
              <CardDescription>
                {t('configCenter.providers.description')}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadProviders} disabled={isLoading}>
                <RefreshCw className="h-4 w-4" />
                {t('configCenter.providers.refresh')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProvider(null);
                  setIsFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('configCenter.providers.add')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          {message && <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">{message}</div>}

          <div className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Download className="h-4 w-4" />
              {t('configCenter.providers.importCurrent')}
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input value={importId} onChange={(event) => setImportId(event.target.value)} placeholder={t('configCenter.providers.providerId')} />
              <Input value={importName} onChange={(event) => setImportName(event.target.value)} placeholder={t('configCenter.providers.providerName')} />
              <Button variant="outline" onClick={handleImportCurrent}>{t('configCenter.providers.import')}</Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('configCenter.providers.loading')}
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t('configCenter.providers.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => {
                const env = provider.settingsConfig?.env || {};
                const meta = provider.meta || {};
                const requestUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '';
                const defaultModel = typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '';
                const authField = typeof meta.apiKeyField === 'string' ? meta.apiKeyField : env.ANTHROPIC_AUTH_TOKEN ? 'ANTHROPIC_AUTH_TOKEN' : env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : '';
                const apiFormat = typeof meta.apiFormat === 'string' ? meta.apiFormat : 'anthropic';
                return (
                  <div key={provider.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-foreground">{provider.name}</h4>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{provider.id}</span>
                          {provider.isCurrent && (
                            <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3" />
                              {t('configCenter.providers.current')}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5 text-sm text-muted-foreground">
                          <div>{t('configCenter.form.requestUrl')}: {requestUrl || t('configCenter.providers.notSet')}</div>
                          <div>{t('configCenter.form.defaultModel')}: {defaultModel || t('configCenter.providers.notSet')}</div>
                          <div>{t('configCenter.form.authField')}: {authField || t('configCenter.providers.notSet')}</div>
                          <div>{t('configCenter.form.apiFormat')}: {apiFormat || t('configCenter.providers.notSet')}</div>
                          {provider.notes && <div>{t('configCenter.providers.notes')}: {provider.notes}</div>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-nowrap gap-2">
                        <Button size="sm" onClick={() => handleApply(provider)}>{t('configCenter.providers.apply')}</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingProvider(provider);
                            setIsFormOpen(true);
                          }}
                        >
                          {t('configCenter.providers.edit')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDuplicate(provider)}>
                          <Copy className="h-4 w-4" />
                          {t('configCenter.providers.duplicate')}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(provider)} disabled={provider.isCurrent}>
                          <Trash2 className="h-4 w-4" />
                          {t('configCenter.providers.delete')}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentProvider && (
            <p className="text-xs text-muted-foreground">
              {t('configCenter.providers.applyHint')}
            </p>
          )}
        </CardContent>
      </Card>

      <ProviderFormModal
        open={isFormOpen}
        isSaving={isSaving}
        initialValues={formInitialValues}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProvider(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
