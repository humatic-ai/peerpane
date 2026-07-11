/* eslint-disable react/prop-types */
import { FaTrash } from 'react-icons/fa';
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
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  visible,
  isDarkMode = false,
}) => {
  if (!visible) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className={`mb-4 text-lg font-semibold ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
        {t('chat_history_title')}
      </h2>
      {sessions.length === 0 ? (
        <div
          className={`rounded-xl border border-planet9-border p-4 text-center ${isDarkMode ? 'bg-planet9-surface text-gray-400' : 'bg-planet9-bg text-slate-500'}`}>
          {t('chat_history_empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className={`group relative rounded-xl border border-planet9-border p-3 transition-all ${
                isDarkMode ? 'bg-planet9-surface hover:bg-slate-700' : 'bg-white hover:bg-slate-50'
              }`}>
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left" type="button">
                <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                  {session.title}
                </h3>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                  {formatDate(session.createdAt)}
                </p>
              </button>

              <ComposerTooltip content={t('chat_tooltip_delete')} className="absolute bottom-2 right-2">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionDelete(session.id);
                  }}
                  className={`rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isDarkMode
                      ? 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                      : 'bg-white text-slate-500 hover:bg-slate-100'
                  }`}
                  aria-label={t('chat_tooltip_delete')}
                  type="button">
                  <FaTrash size={14} />
                </button>
              </ComposerTooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistoryList;
