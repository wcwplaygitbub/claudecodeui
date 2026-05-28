import { useTranslation } from 'react-i18next';
import { useTasksSettings } from '../../../../../contexts/TasksSettingsContext';
import SettingsCard from '../../SettingsCard';
import SettingsRow from '../../SettingsRow';
import SettingsSection from '../../SettingsSection';
import SettingsToggle from '../../SettingsToggle';

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
  setTasksEnabled: (enabled: boolean) => void;
};

export default function TasksSettingsTab() {
  const { t } = useTranslation('settings');
  const {
    tasksEnabled,
    setTasksEnabled,
  } = useTasksSettings() as TasksSettingsContextValue;

  return (
    <div className="space-y-8">
      <SettingsSection title={t('mainTabs.tasks')}>
        <SettingsCard>
          <SettingsRow
            label={t('tasks.settings.enableLabel')}
            description={t('tasks.settings.enableDescription')}
          >
            <SettingsToggle
              checked={tasksEnabled}
              onChange={setTasksEnabled}
              ariaLabel={t('tasks.settings.enableLabel')}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
