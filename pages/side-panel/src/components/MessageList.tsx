import type { Message } from '@extension/storage';
import { Actors } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo } from 'react';
import MarkdownContent from './MarkdownContent';

interface MessageListProps {
  messages: Message[];
  isDarkMode?: boolean;
}

export default memo(function MessageList({ messages, isDarkMode = false }: MessageListProps) {
  return (
    <div className="flex max-w-full flex-col gap-2.5">
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

function roleColor(actor: string, isDarkMode: boolean): string {
  if (actor === Actors.USER) return isDarkMode ? 'text-indigo-300' : 'text-indigo-500';
  if (actor === Actors.ASSISTANT) return isDarkMode ? 'text-purple-300' : 'text-[#764ba2]';
  return isDarkMode ? 'text-gray-500' : 'text-slate-400';
}

function MessageBlock({ message, isDarkMode = false }: MessageBlockProps) {
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
  const useMarkdown = message.actor === Actors.ASSISTANT && !isProgress;
  const isUser = message.actor === Actors.USER;

  return (
    <div className={`flex max-w-[88%] flex-col gap-[3px] ${isUser ? 'items-start self-start' : 'items-end self-end'}`}>
      <span
        className={`px-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${roleColor(message.actor, isDarkMode)}`}>
        {actor.name}
      </span>

      {isProgress ? (
        <div className={`h-1 w-40 overflow-hidden rounded ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div className="h-full animate-progress bg-indigo-500" />
        </div>
      ) : (
        <div
          className={`break-words rounded-xl border px-3 py-2 text-[13px] leading-[1.5] ${
            isDarkMode
              ? 'border-slate-700 bg-slate-800 text-gray-200'
              : 'border-planet9-border bg-planet9-tertiary text-slate-800'
          }`}>
          {useMarkdown ? (
            <MarkdownContent content={message.content} isDarkMode={isDarkMode} />
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
      )}
    </div>
  );
}
