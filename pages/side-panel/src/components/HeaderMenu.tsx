import { useCallback, useEffect, useRef, useState } from 'react';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { FiSun, FiMoon, FiMonitor, FiChevronRight, FiCheck } from 'react-icons/fi';
import { themeSettingsStore, type ThemePreference } from '@extension/storage';
import { t } from '@extension/i18n';
import ComposerTooltip from './ComposerTooltip';

const GearIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.25 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

interface HeaderMenuProps {
  isDarkMode?: boolean;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const THEME_OPTIONS: { value: ThemePreference; icon: typeof FiSun; labelKey: string }[] = [
  { value: 'light', icon: FiSun, labelKey: 'theme_light' },
  { value: 'dark', icon: FiMoon, labelKey: 'theme_dark' },
  { value: 'system', icon: FiMonitor, labelKey: 'theme_system' },
];

export default function HeaderMenu({ isDarkMode = false, theme, onThemeChange }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setThemeSubmenuOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const openSettings = () => {
    close();
    chrome.runtime.openOptionsPage();
  };

  const selectTheme = async (next: ThemePreference) => {
    onThemeChange(next);
    close();
    try {
      await themeSettingsStore.updateSettings({ theme: next });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const panelClass = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-gray-100 shadow-xl'
    : 'border-gray-200 bg-white text-slate-800 shadow-lg';
  const itemHover = isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50';
  const muted = isDarkMode ? 'text-gray-400' : 'text-slate-500';
  const divider = isDarkMode ? 'border-slate-700' : 'border-gray-100';
  const activeItem = isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-700';

  const currentTheme = THEME_OPTIONS.find(o => o.value === theme) ?? THEME_OPTIONS[0];
  const CurrentThemeIcon = currentTheme.icon;

  return (
    <div className="relative" ref={menuRef}>
      <ComposerTooltip content={t('chat_tooltip_more')} side="bottom" disabled={open}>
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="icon-btn"
          aria-label={t('chat_tooltip_more')}
          aria-haspopup="menu"
          aria-expanded={open}
          tabIndex={0}>
          <BsThreeDotsVertical size={18} />
        </button>
      </ComposerTooltip>

      {open && (
        <div role="menu" className={`absolute right-0 z-50 mt-2 w-52 rounded-xl border py-1 ${panelClass}`}>
          <button
            type="button"
            role="menuitem"
            onClick={openSettings}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm ${itemHover}`}>
            <GearIcon className={muted} />
            <span>{t('nav_settings')}</span>
          </button>

          <div className={`my-1 border-t ${divider}`} />

          <div className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={themeSubmenuOpen}
              onClick={() => setThemeSubmenuOpen(prev => !prev)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm ${
                themeSubmenuOpen ? activeItem : itemHover
              }`}>
              <CurrentThemeIcon size={16} className={themeSubmenuOpen ? '' : muted} />
              <span>{t('theme_label')}</span>
              <FiChevronRight size={14} className={`ml-auto ${muted}`} />
            </button>

            {themeSubmenuOpen && (
              <div
                role="menu"
                className={`absolute right-full top-0 z-50 mr-1 w-40 rounded-xl border py-1 ${panelClass}`}>
                {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => {
                  const selected = theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => selectTheme(value)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm ${
                        selected ? activeItem : itemHover
                      }`}>
                      <Icon size={16} className={selected ? '' : muted} />
                      <span>{t(labelKey as 'theme_light')}</span>
                      {selected && <FiCheck size={14} className="ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
