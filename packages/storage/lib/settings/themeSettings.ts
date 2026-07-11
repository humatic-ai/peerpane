import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeSettingsConfig {
  theme: ThemePreference;
}

export type ThemeSettingsStorage = BaseStorage<ThemeSettingsConfig> & {
  updateSettings: (settings: Partial<ThemeSettingsConfig>) => Promise<void>;
  getSettings: () => Promise<ThemeSettingsConfig>;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettingsConfig = {
  theme: 'light',
};

const storage = createStorage<ThemeSettingsConfig>('theme-settings', DEFAULT_THEME_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const themeSettingsStore: ThemeSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<ThemeSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_THEME_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async getSettings() {
    const settings = await storage.get();
    return {
      ...DEFAULT_THEME_SETTINGS,
      ...settings,
    };
  },
};
