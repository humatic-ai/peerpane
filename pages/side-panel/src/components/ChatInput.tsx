import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { LuPlus, LuCamera, LuMic, LuSend, LuSquare, LuPlay, LuLoaderCircle } from 'react-icons/lu';
import { t } from '@extension/i18n';
import ComposerTooltip from './ComposerTooltip';

/** Max height (px) for composer textarea auto-grow; keep in sync with `max-h-[150px]`. */
const TEXTAREA_AUTOGROW_MAX_PX = 150;

interface ChatInputProps {
  onSendMessage: (text: string, displayText?: string) => void;
  onStopTask: () => void;
  onMicClick?: () => void;
  isRecording?: boolean;
  isProcessingSpeech?: boolean;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string | ((prev: string) => string)) => void) => void;
  isDarkMode?: boolean;
  historicalSessionId?: string | null;
  onReplay?: (sessionId: string) => void;
  /** When true, background attaches screenshot + page text to the next message */
  attachPage?: boolean;
  onAttachPageChange?: (enabled: boolean) => void;
}

interface AttachedFile {
  name: string;
  content: string;
  type: string;
}

export default function ChatInput({
  onSendMessage,
  onStopTask,
  onMicClick,
  isRecording = false,
  isProcessingSpeech = false,
  disabled,
  showStopButton,
  setContent,
  isDarkMode = false,
  historicalSessionId,
  onReplay,
  attachPage = false,
  onAttachPageChange,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const isSendButtonDisabled = useMemo(
    () => disabled || (text.trim() === '' && attachedFiles.length === 0),
    [disabled, text, attachedFiles],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const sh = Math.ceil(el.scrollHeight);
    const capped = Math.min(sh, TEXTAREA_AUTOGROW_MAX_PX);
    el.style.height = `${capped}px`;
    el.style.overflowY = sh > TEXTAREA_AUTOGROW_MAX_PX ? 'auto' : 'hidden';
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  useEffect(() => {
    if (setContent) {
      setContent(setText);
    }
  }, [setContent]);

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [text, syncTextareaHeight]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmedText = text.trim();

      if (trimmedText || attachedFiles.length > 0) {
        let messageContent = trimmedText;
        let displayContent = trimmedText;

        if (attachedFiles.length > 0) {
          const fileContents = attachedFiles
            .map(file => {
              return `\n\n<nano_file_content type="file" name="${file.name}">\n${file.content}\n</nano_file_content>`;
            })
            .join('\n');

          messageContent = trimmedText
            ? `${trimmedText}\n\n<nano_attached_files>${fileContents}</nano_attached_files>`
            : `<nano_attached_files>${fileContents}</nano_attached_files>`;

          const fileList = attachedFiles.map(file => `📎 ${file.name}`).join('\n');
          displayContent = trimmedText ? `${trimmedText}\n\n${fileList}` : fileList;
        }

        onSendMessage(messageContent, displayContent);
        setText('');
        setAttachedFiles([]);
      }
    },
    [text, attachedFiles, onSendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleReplay = useCallback(() => {
    if (historicalSessionId && onReplay) {
      onReplay(historicalSessionId);
    }
  }, [historicalSessionId, onReplay]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];
    const allowedTypes = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yaml', '.yml'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(fileExt)) {
        console.warn(`File type ${fileExt} not supported. Only text-based files are allowed.`);
        continue;
      }

      if (file.size > 1024 * 1024) {
        console.warn(`File ${file.name} is too large. Maximum size is 1MB.`);
        continue;
      }

      try {
        const content = await file.text();
        newFiles.push({
          name: file.name,
          content,
          type: file.type || 'text/plain',
        });
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const cardTone = isDarkMode
    ? 'border-slate-600 bg-slate-900/80 backdrop-blur-md focus-within:border-slate-500'
    : 'border-gray-200 bg-white/55 backdrop-blur-xl backdrop-saturate-150 md:bg-white/90 md:backdrop-blur-md md:backdrop-saturate-100 focus-within:border-gray-300';

  return (
    <form
      onSubmit={handleSubmit}
      className={`message-input-card grid min-w-0 max-w-full grid-cols-1 gap-y-1.5 rounded-[20px] border p-3 shadow-sm transition-[box-shadow,border-color] focus-within:shadow-md ${cardTone} ${
        disabled ? 'cursor-not-allowed opacity-90' : ''
      }`}
      aria-label={t('chat_input_form')}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.json,.csv,.log,.xml,.yaml,.yml"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>
              <span className="max-w-[150px] truncate">{file.name}</span>
              <ComposerTooltip content={t('chat_tooltip_remove')}>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className={`ml-0.5 rounded-sm px-0.5 transition-colors ${
                    isDarkMode ? 'hover:bg-slate-600' : 'hover:bg-gray-200'
                  }`}
                  aria-label={t('chat_tooltip_remove')}>
                  ✕
                </button>
              </ComposerTooltip>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-w-0 max-w-full items-end gap-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-disabled={disabled}
          rows={1}
          className={`min-h-0 min-w-0 flex-1 resize-none overflow-x-hidden border-none bg-transparent py-2 text-base focus:outline-none md:text-[15px] ${
            disabled
              ? isDarkMode
                ? 'cursor-not-allowed text-gray-500 placeholder-gray-600'
                : 'cursor-not-allowed text-gray-500 placeholder-gray-400'
              : isDarkMode
                ? 'text-gray-100 placeholder-gray-500'
                : 'text-gray-900 placeholder-gray-400'
          } max-h-[150px]`}
          placeholder={attachedFiles.length > 0 ? 'Add a message (optional)...' : t('chat_input_placeholder')}
          aria-label={t('chat_input_editor')}
        />
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <ComposerTooltip content={t('chat_tooltip_attach')}>
            <button
              type="button"
              onClick={handleFileSelect}
              disabled={disabled || isRecording}
              aria-label={t('chat_tooltip_attach')}
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isDarkMode ? 'text-gray-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <LuPlus size={18} strokeWidth={2} aria-hidden />
            </button>
          </ComposerTooltip>

          {onAttachPageChange && (
            <ComposerTooltip content={attachPage ? t('chat_tooltip_detachPage') : t('chat_tooltip_attachPage')}>
              <button
                type="button"
                onClick={() => onAttachPageChange(!attachPage)}
                disabled={disabled || isRecording}
                aria-pressed={attachPage}
                aria-label={attachPage ? t('chat_tooltip_detachPage') : t('chat_tooltip_attachPage')}
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  attachPage
                    ? 'bg-red-100 text-red-600'
                    : isDarkMode
                      ? 'bg-transparent text-gray-400 hover:bg-slate-700'
                      : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}>
                <LuCamera size={18} strokeWidth={2} aria-hidden />
              </button>
            </ComposerTooltip>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          {onMicClick && (
            <ComposerTooltip
              content={
                isProcessingSpeech
                  ? t('chat_tooltip_transcribing')
                  : isRecording
                    ? t('chat_tooltip_stopDictation')
                    : t('chat_tooltip_dictate')
              }>
              <button
                type="button"
                onClick={onMicClick}
                disabled={disabled || isProcessingSpeech}
                aria-label={
                  isProcessingSpeech
                    ? t('chat_tooltip_transcribing')
                    : isRecording
                      ? t('chat_tooltip_stopDictation')
                      : t('chat_tooltip_dictate')
                }
                aria-pressed={isRecording}
                className={`mic-recording-pulse relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all select-none disabled:cursor-not-allowed disabled:opacity-40 ${
                  isProcessingSpeech
                    ? isDarkMode
                      ? 'bg-slate-800 text-gray-400'
                      : 'bg-gray-100 text-gray-500'
                    : isRecording
                      ? 'animate-pulse bg-red-100 text-red-600'
                      : isDarkMode
                        ? 'bg-transparent text-gray-400 hover:bg-slate-700'
                        : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}>
                {isProcessingSpeech ? (
                  <LuLoaderCircle className="size-[18px] shrink-0 animate-spin" aria-hidden />
                ) : (
                  <LuMic size={18} strokeWidth={2} aria-hidden />
                )}
              </button>
            </ComposerTooltip>
          )}

          {showStopButton ? (
            <ComposerTooltip content={t('chat_tooltip_stop')}>
              <button
                type="button"
                onClick={onStopTask}
                className={`relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition-colors ${
                  isDarkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-100 hover:bg-gray-200'
                }`}
                aria-label={t('chat_tooltip_stop')}>
                <span
                  className="pointer-events-none absolute inset-0 animate-spin rounded-full"
                  style={{
                    animationDuration: '0.8s',
                    background:
                      'conic-gradient(from 0deg, transparent 0deg, #6366f1 60deg, #a855f7 180deg, transparent 360deg)',
                    mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))',
                    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))',
                  }}
                />
                <LuSquare
                  size={12}
                  fill="currentColor"
                  className={`relative z-10 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                  aria-hidden
                />
              </button>
            </ComposerTooltip>
          ) : historicalSessionId ? (
            <ComposerTooltip content={t('chat_tooltip_replay')}>
              <button
                type="button"
                onClick={handleReplay}
                disabled={!historicalSessionId}
                aria-disabled={!historicalSessionId}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white transition-all hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t('chat_tooltip_replay')}>
                <LuPlay size={16} strokeWidth={2} aria-hidden />
              </button>
            </ComposerTooltip>
          ) : (
            <ComposerTooltip content={t('chat_tooltip_send')}>
              <button
                type="submit"
                disabled={isSendButtonDisabled || isRecording}
                aria-disabled={isSendButtonDisabled || isRecording}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white transition-all hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-indigo-500 disabled:hover:to-purple-600"
                aria-label={t('chat_tooltip_send')}>
                <LuSend size={16} strokeWidth={2} aria-hidden />
              </button>
            </ComposerTooltip>
          )}
        </div>
      </div>
    </form>
  );
}
