import { useState, useEffect } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import {
  type HumaticAIConfig,
  humaticaiStore,
  DEFAULT_HUMATICAI_SETTINGS,
  DEFAULT_HUMATICAI_BASE_URL,
} from '@extension/storage';
import { Button } from '@extension/ui';
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

  const labelClass = `mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const hintClass = `mb-2 text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`;
  const inputClass = [
    'h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-sm outline-none transition-[color,box-shadow]',
    'focus-visible:border-indigo-500 focus-visible:ring-[3px] focus-visible:ring-indigo-500/50',
    isDarkMode
      ? 'border-slate-600 text-gray-200 placeholder:text-gray-500'
      : 'border-gray-200 text-gray-800 placeholder:text-gray-400',
  ].join(' ');

  return (
    <section className="space-y-6">
      <div
        className={`rounded-xl border py-6 text-left shadow-sm ${
          isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
        }`}>
        <div className="space-y-6 px-6">
          <div>
            <h2 className={`text-left text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {t('options_humaticai_header')}
            </h2>
            <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('options_humaticai_desc')}
            </p>
          </div>

          <div className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="humaticai-api-key" className={labelClass}>
                {t('options_humaticai_apiKey')}
              </label>
              <p className={hintClass}>{t('options_humaticai_apiKey_desc')}</p>
              <div className="relative">
                <input
                  id="humaticai-api-key"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={settings.apiKey}
                  onChange={e => updateSetting('apiKey', e.target.value)}
                  placeholder="hai_..."
                  className={`${inputClass} pr-10 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 ${
                    isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  aria-label={showKey ? t('options_humaticai_hideKey') : t('options_humaticai_showKey')}>
                  {showKey ? <FiEyeOff size={16} aria-hidden="true" /> : <FiEye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="humaticai-base-url" className={labelClass}>
                {t('options_humaticai_baseUrl')}
              </label>
              <p className={hintClass}>{t('options_humaticai_baseUrl_desc')}</p>
              <input
                id="humaticai-base-url"
                type="url"
                value={settings.baseUrl}
                onChange={e => updateSetting('baseUrl', e.target.value || DEFAULT_HUMATICAI_BASE_URL)}
                placeholder={DEFAULT_HUMATICAI_BASE_URL}
                className={inputClass}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="primary"
                disabled={testStatus === 'testing'}
                onClick={handleTestConnection}
                theme={isDarkMode ? 'dark' : 'light'}>
                {testStatus === 'testing' ? t('options_humaticai_testing') : t('options_humaticai_test')}
              </Button>
              <Button
                type="button"
                variant="outline"
                theme={isDarkMode ? 'dark' : 'light'}
                onClick={() => {
                  setSettings(DEFAULT_HUMATICAI_SETTINGS);
                  void humaticaiStore.updateSettings(DEFAULT_HUMATICAI_SETTINGS);
                }}>
                {t('options_humaticai_reset')}
              </Button>
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
      </div>
    </section>
  );
};
