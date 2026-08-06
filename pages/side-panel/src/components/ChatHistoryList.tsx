/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuTrash2, LuSearch, LuX, LuMessageSquare } from 'react-icons/lu';
import { t } from '@extension/i18n';
import ComposerTooltip from './ComposerTooltip';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  visible: boolean;
  isDarkMode?: boolean;
  activeSessionId?: string | null;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  visible,
  isDarkMode = false,
  activeSessionId = null,
}) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* Sticky chrome: title + search — full panel width */}
      <div
        className={`w-full shrink-0 border-b px-3 pb-3 pt-1 ${
          isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-gray-100 bg-white'
        }`}>
        <div className="mb-2.5 flex w-full items-baseline justify-between gap-2">
          <h2 className={`text-[15px] font-semibold tracking-tight ${isDarkMode ? 'text-gray-100' : 'text-slate-900'}`}>
            {t('chat_history_title')}
          </h2>
          {sessions.length > 0 && (
            <span className={`text-[11px] tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {hasQuery ? `${filtered.length}/${sessions.length}` : sessions.length}
            </span>
          )}
        </div>
        <div className="relative w-full">
          <LuSearch
            className={`pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape' && hasQuery) {
                e.preventDefault();
                setQuery('');
              }
            }}
            placeholder={t('chat_history_searchPlaceholder')}
            aria-label={t('chat_history_searchPlaceholder')}
            className={`box-border w-full rounded-lg border py-2 pl-8 pr-8 text-sm outline-none transition-colors ${
              isDarkMode
                ? 'border-slate-700 bg-slate-900 text-gray-100 placeholder:text-gray-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/40'
                : 'border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:ring-1 focus:ring-indigo-200'
            }`}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              className={`absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md ${
                isDarkMode ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-400 hover:bg-gray-100'
              }`}
              aria-label={t('chat_tooltip_remove')}>
              <LuX className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list — edge-to-edge rows */}
      <div className="scrollbar-gutter-stable min-h-0 w-full flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <div
            className={`flex w-full flex-col items-center justify-center gap-2 px-4 py-12 text-center ${
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            }`}>
            <div
              className={`flex size-10 items-center justify-center rounded-full ${
                isDarkMode ? 'bg-slate-900 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}>
              <LuMessageSquare className="size-5" aria-hidden />
            </div>
            <p className="text-sm">{t('chat_history_empty')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`w-full px-3 py-10 text-center text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            {t('chat_history_noMatch')}
          </div>
        ) : (
          <ul className="flex w-full flex-col" role="list">
            {filtered.map(session => {
              const isActive = session.id === activeSessionId;
              return (
                <li key={session.id} className="w-full">
                  <div
                    className={`group relative flex min-h-10 w-full items-center overflow-hidden transition-colors ${
                      isActive
                        ? isDarkMode
                          ? 'bg-indigo-950/60'
                          : 'bg-indigo-50'
                        : isDarkMode
                          ? 'hover:bg-slate-900'
                          : 'hover:bg-gray-50'
                    }`}>
                    <button
                      onClick={() => onSessionSelect(session.id)}
                      className="grid min-h-10 min-w-0 w-full flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2.5 text-left"
                      type="button">
                      <span
                        className={`min-w-0 truncate text-sm leading-5 ${
                          isActive
                            ? isDarkMode
                              ? 'font-medium text-indigo-200'
                              : 'font-medium text-indigo-900'
                            : isDarkMode
                              ? 'text-gray-200'
                              : 'text-gray-900'
                        }`}>
                        {session.title || 'Untitled'}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] leading-none tabular-nums transition-opacity group-hover:opacity-0 ${
                          isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                        {formatRelativeTime(session.createdAt)}
                      </span>
                    </button>

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <ComposerTooltip content={t('chat_tooltip_delete')}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSessionDelete(session.id);
                          }}
                          className={`flex size-7 items-center justify-center rounded-md ${
                            isDarkMode
                              ? 'text-gray-400 hover:bg-red-950/50 hover:text-red-400'
                              : 'text-gray-500 hover:bg-red-50 hover:text-red-600'
                          }`}
                          aria-label={t('chat_tooltip_delete')}
                          type="button">
                          <LuTrash2 size={14} aria-hidden />
                        </button>
                      </ComposerTooltip>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryList;
