import { useTranslation } from 'react-i18next';

import ProviderCenter from './providers/ProviderCenter';

export default function ConfigCenterSettingsTab() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('configCenter.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('configCenter.description')}
        </p>
      </div>

      <ProviderCenter />
    </div>
  );
}
