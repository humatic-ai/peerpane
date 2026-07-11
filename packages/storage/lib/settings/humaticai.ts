import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export const DEFAULT_HUMATICAI_BASE_URL = 'https://humaticai.com/ragchat';

export interface HumaticAIConfig {
  apiKey: string;
  baseUrl: string;
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
  threadIdsBySession: {},
};

const storage = createStorage<HumaticAIConfig>('humaticai-settings', DEFAULT_HUMATICAI_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/** Drop legacy keys (provider / model / useRag) so they are never re-persisted. */
function sanitize(settings: Partial<HumaticAIConfig> & Record<string, unknown>): HumaticAIConfig {
  return {
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : '',
    baseUrl:
      typeof settings.baseUrl === 'string' && settings.baseUrl.trim() ? settings.baseUrl : DEFAULT_HUMATICAI_BASE_URL,
    threadIdsBySession:
      settings.threadIdsBySession && typeof settings.threadIdsBySession === 'object'
        ? (settings.threadIdsBySession as Record<string, string>)
        : {},
  };
}

export const humaticaiStore: HumaticAIStorage = {
  ...storage,

  async updateSettings(settings: Partial<HumaticAIConfig>) {
    const current = sanitize(
      ((await storage.get()) || DEFAULT_HUMATICAI_SETTINGS) as unknown as Record<string, unknown>,
    );
    await storage.set(
      sanitize({
        ...current,
        ...settings,
        threadIdsBySession: settings.threadIdsBySession ?? current.threadIdsBySession ?? {},
      }),
    );
  },

  async getSettings() {
    const settings = await storage.get();
    return sanitize({ ...DEFAULT_HUMATICAI_SETTINGS, ...(settings as unknown as Record<string, unknown>) });
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
