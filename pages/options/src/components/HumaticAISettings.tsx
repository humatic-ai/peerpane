import { useState, useEffect } from 'react';
import {
  type HumaticAIConfig,
  humaticaiStore,
  DEFAULT_HUMATICAI_SETTINGS,
  DEFAULT_HUMATICAI_BASE_URL,
} from '@extension/storage';
import { t } from '@extension/i18n';

interface HumaticAISettingsProps {
  isDarkMode?: boolean;
}

export const HumaticAISettings = ({ isDarkMode = false }: HumaticAISettingsProps) => {
  const [settings, setSettings] = useState<HumaticAIConfig>(DEFAULT_HUMATICAI_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    humaticaiStore.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof HumaticAIConfig>(key: K, value: HumaticAIConfig[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await humaticaiStore.updateSettings({ [key]: value } as Partial<HumaticAIConfig>);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    const baseUrl = (settings.baseUrl || DEFAULT_HUMATICAI_BASE_URL).replace(/\/+$/, '');
    try {
      const headers: Record<string, string> = {};
      if (settings.apiKey?.trim()) {
        headers['X-API-Key'] = settings.apiKey.trim();
      }
      const response = await fetch(`${baseUrl}/health`, { method: 'GET', headers });
      if (response.ok) {
        setTestStatus('ok');
        setTestMessage(t('options_humaticai_test_ok'));
      } else {
        setTestStatus('fail');
        setTestMessage(t('options_humaticai_test_fail', [`HTTP ${response.status}`]));
      }
    } catch (err) {
      setTestStatus('fail');
      setTestMessage(t('options_humaticai_test_fail', [err instanceof Error ? err.message : 'Connection failed']));
    }
  };

  const inputClass = `w-full rounded-md border px-3 py-2 ${
    isDarkMode ? 'border-slate-600 bg-slate-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700'
  }`;

  return (
    <section className="space-y-6">
      <div
        className={`rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-blue-100 bg-white'} p-6 text-left shadow-sm`}>
        <h2 className={`mb-2 text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          {t('options_humaticai_header')}
        </h2>
        <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('options_humaticai_desc')}
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="humaticai-api-key"
              className={`mb-1 block text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('options_humaticai_apiKey')}
            </label>
            <p className={`mb-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('options_humaticai_apiKey_desc')}
            </p>
            <div className="flex gap-2">
              <input
                id="humaticai-api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                value={settings.apiKey}
                onChange={e => updateSetting('apiKey', e.target.value)}
                placeholder="hai_..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className={`shrink-0 rounded-md px-3 py-2 text-sm ${
                  isDarkMode
                    ? 'bg-slate-600 text-gray-200 hover:bg-slate-500'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {showKey ? t('options_humaticai_hideKey') : t('options_humaticai_showKey')}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="humaticai-base-url"
              className={`mb-1 block text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('options_humaticai_baseUrl')}
            </label>
            <p className={`mb-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('options_humaticai_baseUrl_desc')}
            </p>
            <input
              id="humaticai-base-url"
              type="url"
              value={settings.baseUrl}
              onChange={e => updateSetting('baseUrl', e.target.value || DEFAULT_HUMATICAI_BASE_URL)}
              placeholder={DEFAULT_HUMATICAI_BASE_URL}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="humaticai-provider"
                className={`mb-1 block text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('options_humaticai_provider')}
              </label>
              <input
                id="humaticai-provider"
                type="text"
                value={settings.provider || ''}
                onChange={e => updateSetting('provider', e.target.value || undefined)}
                placeholder={t('options_humaticai_optional')}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="humaticai-model"
                className={`mb-1 block text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('options_humaticai_model')}
              </label>
              <input
                id="humaticai-model"
                type="text"
                value={settings.model || ''}
                onChange={e => updateSetting('model', e.target.value || undefined)}
                placeholder={t('options_humaticai_optional')}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('options_humaticai_useRag')}
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('options_humaticai_useRag_desc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.useRag}
              onChange={e => updateSetting('useRag', e.target.checked)}
              className="size-4"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                testStatus === 'testing' ? 'cursor-not-allowed bg-sky-400' : 'bg-sky-500 hover:bg-sky-600'
              }`}>
              {testStatus === 'testing' ? t('options_humaticai_testing') : t('options_humaticai_test')}
            </button>
            {saved && (
              <span className={`text-sm ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                {t('options_humaticai_saved')}
              </span>
            )}
            {testStatus === 'ok' && (
              <span className={`text-sm ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{testMessage}</span>
            )}
            {testStatus === 'fail' && (
              <span className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{testMessage}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
