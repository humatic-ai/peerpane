import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export type LocalePreference = 'system' | 'en' | 'pt_BR' | 'zh_TW';

export interface LocaleSettingsConfig {
  locale: LocalePreference;
}

export type LocaleSettingsStorage = BaseStorage<LocaleSettingsConfig> & {
  updateSettings: (settings: Partial<LocaleSettingsConfig>) => Promise<void>;
  getSettings: () => Promise<LocaleSettingsConfig>;
};

export const DEFAULT_LOCALE_SETTINGS: LocaleSettingsConfig = {
  locale: 'system',
};

const storage = createStorage<LocaleSettingsConfig>('locale-settings', DEFAULT_LOCALE_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const localeSettingsStore: LocaleSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<LocaleSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_LOCALE_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async getSettings() {
    const settings = await storage.get();
    return {
      ...DEFAULT_LOCALE_SETTINGS,
      ...settings,
    };
  },
};
