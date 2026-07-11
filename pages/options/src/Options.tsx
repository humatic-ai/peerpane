import { useState } from 'react';
import '@src/Options.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { t } from '@extension/i18n';
import { FiSettings, FiHelpCircle, FiKey } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { HumaticAISettings } from './components/HumaticAISettings';

type TabTypes = 'humaticai' | 'general' | 'help';

type NavItem = {
  id: TabTypes;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

function getNavItems(): NavItem[] {
  return [
    { id: 'humaticai', icon: FiKey, label: t('options_tabs_humaticai') },
    { id: 'general', icon: FiSettings, label: t('options_tabs_general') },
    { id: 'help', icon: FiHelpCircle, label: t('options_tabs_help') },
  ];
}

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabTypes>('humaticai');
  const [isDarkMode] = useState(false);
  const navItems = getNavItems();

  const handleTabClick = (tabId: TabTypes) => {
    if (tabId === 'help') {
      window.open('https://humaticai.com/docs/chat-api', '_blank');
    } else {
      setActiveTab(tabId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'humaticai':
        return <HumaticAISettings isDarkMode={isDarkMode} />;
      case 'general':
        return <GeneralSettings isDarkMode={isDarkMode} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen min-w-[768px] bg-white text-gray-900">
      <div className="flex w-[200px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="px-5 pb-3 pt-6">
          <h2 className="text-[17px] font-semibold text-gray-900">{t('options_nav_header')}</h2>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6 pt-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto bg-white p-8">
        <div className="mx-auto min-w-[512px] max-w-screen-lg text-left">{renderTabContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
