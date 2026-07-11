import { createRoot } from 'react-dom/client';
import '@src/index.css';
import { localeSettingsStore, type LocalePreference } from '@extension/storage';
import { defaultLocale, setActiveLocale, type DevLocale } from '@extension/i18n';
import SidePanel from '@src/SidePanel';

function resolveLocalePreference(preference: LocalePreference): DevLocale {
  if (preference === 'system') {
    return defaultLocale as DevLocale;
  }
  return preference;
}

async function init() {
  try {
    const { locale } = await localeSettingsStore.getSettings();
    setActiveLocale(resolveLocalePreference(locale));
  } catch (error) {
    console.error('Failed to load locale preference:', error);
    setActiveLocale(defaultLocale as DevLocale);
  }

  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<SidePanel />);
}

void init();
