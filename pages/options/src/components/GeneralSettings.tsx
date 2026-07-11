import { useState, useEffect, type ReactNode } from 'react';
import {
  type GeneralSettingsConfig,
  generalSettingsStore,
  DEFAULT_GENERAL_SETTINGS,
  localeSettingsStore,
  type LocalePreference,
} from '@extension/storage';
import { t, setActiveLocale, defaultLocale, type DevLocale } from '@extension/i18n';
import { Select } from '@extension/ui';

interface GeneralSettingsProps {
  isDarkMode?: boolean;
}

function resolveLocalePreference(preference: LocalePreference): DevLocale {
  if (preference === 'system') {
    return defaultLocale as DevLocale;
  }
  return preference;
}

const LOCALE_OPTIONS: { value: LocalePreference; labelKey: MessageKeyLike }[] = [
  { value: 'system', labelKey: 'options_general_language_system' },
  { value: 'en', labelKey: 'options_general_language_en' },
  { value: 'pt_BR', labelKey: 'options_general_language_pt_BR' },
  { value: 'zh_TW', labelKey: 'options_general_language_zh_TW' },
];

type MessageKeyLike =
  | 'options_general_language_system'
  | 'options_general_language_en'
  | 'options_general_language_pt_BR'
  | 'options_general_language_zh_TW';

function parseBoundedInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Planet 9 Memory “Group memory” row + Switch */
function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
  isDarkMode,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  isDarkMode: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
          {title}
        </label>
        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={[
          'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? (isDarkMode ? 'bg-gray-100' : 'bg-gray-900') : isDarkMode ? 'bg-slate-600' : 'bg-gray-300',
        ].join(' ')}>
        <span
          aria-hidden="true"
          className={`pointer-events-none block size-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** Planet 9 Memory “Minimum relevance score” field */
function NumberField({
  id,
  title,
  description,
  value,
  min,
  max,
  step,
  onChange,
  isDarkMode,
}: {
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  isDarkMode: boolean;
}) {
  const inputClass = [
    'h-9 w-32 rounded-md border bg-transparent px-3 text-sm shadow-sm outline-none transition-[color,box-shadow]',
    'focus-visible:border-indigo-500 focus-visible:ring-[3px] focus-visible:ring-indigo-500/50',
    isDarkMode ? 'border-slate-600 text-gray-200' : 'border-gray-200 text-gray-800',
  ].join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
        {title}
      </label>
      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseBoundedInt(e.target.value, min, max, value))}
        className={inputClass}
      />
    </div>
  );
}

function SettingsCard({ title, isDarkMode, children }: { title: string; isDarkMode: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border py-6 shadow-sm ${
        isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
      }`}>
      <div className="px-6 pb-4">
        <h3 className={`text-base font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
      </div>
      <div className="space-y-4 px-6">{children}</div>
    </div>
  );
}

export const GeneralSettings = ({ isDarkMode = false }: GeneralSettingsProps) => {
  const [settings, setSettings] = useState<GeneralSettingsConfig>(DEFAULT_GENERAL_SETTINGS);
  const [localePreference, setLocalePreference] = useState<LocalePreference>('system');

  useEffect(() => {
    let cancelled = false;
    generalSettingsStore.getSettings().then(next => {
      if (!cancelled) setSettings(next);
    });
    localeSettingsStore.getSettings().then(next => {
      if (!cancelled) setLocalePreference(next.locale);
    });
    const unsubscribe = generalSettingsStore.subscribe(() => {
      const snapshot = generalSettingsStore.getSnapshot();
      if (snapshot) setSettings({ ...DEFAULT_GENERAL_SETTINGS, ...snapshot });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const updateSetting = async <K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) => {
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));
    await generalSettingsStore.updateSettings({ [key]: value } as Partial<GeneralSettingsConfig>);
    const latestSettings = await generalSettingsStore.getSettings();
    setSettings(latestSettings);
  };

  const updateLocale = async (next: LocalePreference) => {
    setLocalePreference(next);
    await localeSettingsStore.updateSettings({ locale: next });
    setActiveLocale(resolveLocalePreference(next));
    window.location.reload();
  };

  return (
    <section className="max-w-2xl space-y-6">
      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('options_general_scope_note')}</p>

      <SettingsCard title={t('options_general_section_preferences')} isDarkMode={isDarkMode}>
        <div className="space-y-1.5">
          <label
            htmlFor="app-language"
            className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            {t('options_general_language')}
          </label>
          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('options_general_language_desc')}
          </p>
          <Select
            id="app-language"
            value={localePreference}
            onChange={v => updateLocale(v as LocalePreference)}
            theme={isDarkMode ? 'dark' : 'light'}
            className="max-w-xs"
            options={LOCALE_OPTIONS.map(option => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
        </div>
      </SettingsCard>

      <SettingsCard title={t('options_general_section_toggles')} isDarkMode={isDarkMode}>
        <ToggleRow
          id="useBrowserAgent"
          title={t('options_general_useBrowserAgent')}
          description={t('options_general_useBrowserAgent_desc')}
          checked={settings.useBrowserAgent}
          onChange={v => updateSetting('useBrowserAgent', v)}
          isDarkMode={isDarkMode}
        />
        <ToggleRow
          id="useVision"
          title={t('options_general_enableVision')}
          description={t('options_general_enableVision_desc')}
          checked={settings.useVision}
          onChange={v => updateSetting('useVision', v)}
          isDarkMode={isDarkMode}
        />
        <ToggleRow
          id="useVisionForPlanner"
          title={t('options_general_enableVisionForPlanner')}
          description={t('options_general_enableVisionForPlanner_desc')}
          checked={settings.useVisionForPlanner}
          onChange={v => updateSetting('useVisionForPlanner', v)}
          isDarkMode={isDarkMode}
        />
        <ToggleRow
          id="displayHighlights"
          title={t('options_general_displayHighlights')}
          description={t('options_general_displayHighlights_desc')}
          checked={settings.displayHighlights}
          onChange={v => updateSetting('displayHighlights', v)}
          isDarkMode={isDarkMode}
        />
        <ToggleRow
          id="replayHistoricalTasks"
          title={t('options_general_replayHistoricalTasks')}
          description={t('options_general_replayHistoricalTasks_desc')}
          checked={settings.replayHistoricalTasks}
          onChange={v => updateSetting('replayHistoricalTasks', v)}
          isDarkMode={isDarkMode}
        />
      </SettingsCard>

      <SettingsCard title={t('options_general_section_advanced')} isDarkMode={isDarkMode}>
        <NumberField
          id="maxSteps"
          title={t('options_general_maxSteps')}
          description={t('options_general_maxSteps_desc')}
          value={settings.maxSteps}
          min={1}
          max={200}
          onChange={v => updateSetting('maxSteps', v)}
          isDarkMode={isDarkMode}
        />
        <NumberField
          id="maxActionsPerStep"
          title={t('options_general_maxActions')}
          description={t('options_general_maxActions_desc')}
          value={settings.maxActionsPerStep}
          min={1}
          max={50}
          onChange={v => updateSetting('maxActionsPerStep', v)}
          isDarkMode={isDarkMode}
        />
        <NumberField
          id="maxFailures"
          title={t('options_general_maxFailures')}
          description={t('options_general_maxFailures_desc')}
          value={settings.maxFailures}
          min={1}
          max={10}
          onChange={v => updateSetting('maxFailures', v)}
          isDarkMode={isDarkMode}
        />
        <NumberField
          id="planningInterval"
          title={t('options_general_planningInterval')}
          description={t('options_general_planningInterval_desc')}
          value={settings.planningInterval}
          min={1}
          max={20}
          onChange={v => updateSetting('planningInterval', v)}
          isDarkMode={isDarkMode}
        />
        <NumberField
          id="minWaitPageLoad"
          title={t('options_general_minWaitPageLoad')}
          description={t('options_general_minWaitPageLoad_desc')}
          value={settings.minWaitPageLoad}
          min={250}
          max={5000}
          step={50}
          onChange={v => updateSetting('minWaitPageLoad', v)}
          isDarkMode={isDarkMode}
        />
      </SettingsCard>
    </section>
  );
};
