import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export const DEFAULT_HUMATICAI_BASE_URL = 'https://humaticai.com/ragchat';

export interface HumaticAIConfig {
  apiKey: string;
  baseUrl: string;
  provider?: string;
  model?: string;
  useRag: boolean;
  /** Maps local chat session IDs to Humatic AI thread IDs for multi-turn continuity */
  threadIdsBySession: Record<string, string>;
}

export type HumaticAIStorage = BaseStorage<HumaticAIConfig> & {
  updateSettings: (settings: Partial<HumaticAIConfig>) => Promise<void>;
  getSettings: () => Promise<HumaticAIConfig>;
  hasApiKey: () => Promise<boolean>;
  getThreadId: (sessionId: string) => Promise<string | undefined>;
  setThreadId: (sessionId: string, threadId: string) => Promise<void>;
  clearThreadId: (sessionId: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
};

export const DEFAULT_HUMATICAI_SETTINGS: HumaticAIConfig = {
  apiKey: '',
  baseUrl: DEFAULT_HUMATICAI_BASE_URL,
  provider: undefined,
  model: undefined,
  useRag: true,
  threadIdsBySession: {},
};

const storage = createStorage<HumaticAIConfig>('humaticai-settings', DEFAULT_HUMATICAI_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const humaticaiStore: HumaticAIStorage = {
  ...storage,

  async updateSettings(settings: Partial<HumaticAIConfig>) {
    const current = (await storage.get()) || DEFAULT_HUMATICAI_SETTINGS;
    await storage.set({
      ...current,
      ...settings,
      // Never let a partial update wipe the thread map unless explicitly provided
      threadIdsBySession: settings.threadIdsBySession ?? current.threadIdsBySession ?? {},
    });
  },

  async getSettings() {
    const settings = await storage.get();
    return {
      ...DEFAULT_HUMATICAI_SETTINGS,
      ...settings,
      threadIdsBySession: settings?.threadIdsBySession ?? {},
    };
  },

  async hasApiKey() {
    const settings = await this.getSettings();
    return Boolean(settings.apiKey?.trim());
  },

  async getThreadId(sessionId: string) {
    const settings = await this.getSettings();
    return settings.threadIdsBySession[sessionId];
  },

  async setThreadId(sessionId: string, threadId: string) {
    const settings = await this.getSettings();
    await storage.set({
      ...settings,
      threadIdsBySession: {
        ...settings.threadIdsBySession,
        [sessionId]: threadId,
      },
    });
  },

  async clearThreadId(sessionId: string) {
    const settings = await this.getSettings();
    const { [sessionId]: _removed, ...rest } = settings.threadIdsBySession;
    await storage.set({
      ...settings,
      threadIdsBySession: rest,
    });
  },

  async resetToDefaults() {
    await storage.set(DEFAULT_HUMATICAI_SETTINGS);
  },
};
