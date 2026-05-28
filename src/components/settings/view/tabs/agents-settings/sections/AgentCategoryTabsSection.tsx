import { useTranslation } from 'react-i18next';
import { cn } from '../../../../../../lib/utils';
import type { AgentCategory } from '../../../../types/types';
import type { AgentCategoryTabsSectionProps } from '../types';

const BASE_AGENT_CATEGORIES: AgentCategory[] = ['account', 'permissions'];

export default function AgentCategoryTabsSection({
  selectedAgent,
  selectedCategory,
  onSelectCategory,
}: AgentCategoryTabsSectionProps) {
  const { t } = useTranslation('settings');
  const categories: AgentCategory[] = selectedAgent === 'claude'
    ? [...BASE_AGENT_CATEGORIES, 'providers']
    : BASE_AGENT_CATEGORIES;

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div role="tablist" className="flex overflow-x-auto px-2 md:px-4">
        {categories.map((category) => (
          <button
            key={category}
            role="tab"
            aria-selected={selectedCategory === category}
            onClick={() => onSelectCategory(category)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium touch-manipulation transition-colors duration-150',
              selectedCategory === category
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {category === 'account' && t('tabs.account')}
            {category === 'permissions' && t('tabs.permissions')}
            {category === 'providers' && t('tabs.providers')}
          </button>
        ))}
      </div>
    </div>
  );
}
