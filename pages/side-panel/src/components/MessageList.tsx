import type { Message } from '@extension/storage';
import { Actors } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo, useCallback, useState } from 'react';
import { LuCopy, LuCheck } from 'react-icons/lu';
import { t } from '@extension/i18n';
import MarkdownContent from './MarkdownContent';
import ComposerTooltip from './ComposerTooltip';

interface MessageListProps {
  messages: Message[];
  isDarkMode?: boolean;
}

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const ACTION_BTN =
  'flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-gray-500 shadow-none transition-colors hover:bg-gray-50 hover:text-gray-700';

const ACTION_BTN_DARK =
  'flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-gray-400 shadow-none transition-colors hover:bg-slate-700 hover:text-gray-200';

export default memo(function MessageList({ messages, isDarkMode = false }: MessageListProps) {
  return (
    <div className="message-list flex max-w-full flex-col px-1 pt-2 md:px-2">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${message.timestamp}-${index}`}
          message={message}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isDarkMode?: boolean;
}

function MessageBlock({ message, isDarkMode = false }: MessageBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = message.content?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, [message.content]);

  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  if (!actor) {
    console.error('Unknown actor', message.actor);
    return <div />;
  }

  const isProgress = message.content === 'Showing progress...';
  const isUser = message.actor === Actors.USER;
  const isAssistant = message.actor === Actors.ASSISTANT;
  const useMarkdown = isAssistant && !isProgress;
  const time = formatTime(message.timestamp);
  const canCopy = Boolean(message.content?.trim()) && !isProgress;
  const actionBtnClass = isDarkMode ? ACTION_BTN_DARK : ACTION_BTN;
  const copyLabel = copied
    ? t('chat_tooltip_copied')
    : isUser
      ? t('chat_tooltip_copyMessage')
      : t('chat_tooltip_copyResponse');

  if (isProgress) {
    return (
      <div className="message-bubble-item mb-5 min-w-0">
        <div className={`h-1 w-40 overflow-hidden rounded ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div className="h-full animate-progress bg-indigo-500" />
        </div>
      </div>
    );
  }

  const copyButton = canCopy ? (
    <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
      <ComposerTooltip content={copyLabel}>
        <button type="button" onClick={handleCopy} className={actionBtnClass} aria-label={copyLabel}>
          {copied ? <LuCheck size={16} className="text-green-500" aria-hidden /> : <LuCopy size={16} aria-hidden />}
        </button>
      </ComposerTooltip>
    </div>
  ) : null;

  return (
    <div className={`message-bubble-item mb-5 flex min-w-0 ${isUser ? 'justify-end' : ''}`}>
      <div className={`flex min-w-0 flex-col gap-1 ${isUser ? 'max-w-[78%] items-end' : 'w-full max-w-full'}`}>
        <div className="group">
          <div
            className={`relative break-words ${
              isUser
                ? 'max-w-full rounded-xl rounded-br-sm bg-gradient-to-br from-indigo-500 to-purple-600 px-3.5 py-2 text-[14px] leading-5 text-white shadow-sm'
                : isDarkMode
                  ? 'max-w-full text-[16px] leading-[26px] text-gray-100'
                  : 'max-w-full text-[16px] leading-[26px] text-gray-900'
            }`}>
            {useMarkdown ? (
              <div className="assistant-content-host">
                <MarkdownContent content={message.content} isDarkMode={isDarkMode} variant="assistant" />
              </div>
            ) : (
              <span className="whitespace-pre-wrap">{message.content}</span>
            )}
          </div>

          <div className={`mt-1 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
            {isUser && copyButton}
            <span className={`px-1 text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{time}</span>
            {!isUser && copyButton}
          </div>
        </div>
      </div>
    </div>
  );
}
