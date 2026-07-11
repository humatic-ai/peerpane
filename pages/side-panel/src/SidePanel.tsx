/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type Message,
  Actors,
  chatHistoryStore,
  humaticaiStore,
  themeSettingsStore,
  generalSettingsStore,
  type ThemePreference,
} from '@extension/storage';
import favoritesStorage, { type FavoritePrompt } from '@extension/storage/lib/prompt/favorites';
import { t } from '@extension/i18n';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import BookmarkList from './components/BookmarkList';
import HeaderMenu from './components/HeaderMenu';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import './SidePanel.css';

const progressMessage = 'Showing progress...';

interface Suggestion {
  title: string;
  prompt: string;
}

/** Convert a recorded audio Blob to raw base64 (no data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

const SidePanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; createdAt: number }>>([]);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isHistoricalSession, setIsHistoricalSession] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  );
  const isDarkMode = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [attachPage, setAttachPage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingTranscribeRef = useRef<{
    resolve: (text: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string | ((prev: string) => string)) => void) | null>(null);
  const streamingAssistantIndexRef = useRef<number | null>(null);
  const isReplayingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const loadTheme = async () => {
      try {
        const settings = await themeSettingsStore.getSettings();
        if (!cancelled) setThemePreference(settings.theme);
      } catch (error) {
        console.error('Error loading theme preference:', error);
      }
    };
    loadTheme();
    const unsubscribe = themeSettingsStore.subscribe(() => {
      const snapshot = themeSettingsStore.getSnapshot();
      if (snapshot?.theme) setThemePreference(snapshot.theme);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const checkApiKeyConfiguration = useCallback(async () => {
    try {
      const configured = await humaticaiStore.hasApiKey();
      setHasApiKey(configured);
    } catch (error) {
      console.error('Error checking Humatic AI configuration:', error);
      setHasApiKey(false);
    }
  }, []);

  useEffect(() => {
    checkApiKeyConfiguration();
  }, [checkApiKeyConfiguration]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkApiKeyConfiguration();
      }
    };
    const handleFocus = () => {
      checkApiKeyConfiguration();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkApiKeyConfiguration]);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const appendMessage = useCallback((newMessage: Message, sessionId?: string | null) => {
    const isProgressMessage = newMessage.content === progressMessage;
    setMessages(prev => {
      const filtered = prev.filter((msg, idx) => !(msg.content === progressMessage && idx === prev.length - 1));
      return [...filtered, newMessage];
    });

    const effectiveSessionId = sessionId !== undefined ? sessionId : sessionIdRef.current;
    if (effectiveSessionId && !isProgressMessage) {
      chatHistoryStore
        .addMessage(effectiveSessionId, newMessage)
        .catch(err => console.error('Failed to save message to history:', err));
    }
  }, []);

  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;
      let skip = true;
      let displayProgress = false;

      switch (actor) {
        case Actors.SYSTEM:
          switch (state) {
            case ExecutionState.TASK_START:
              setIsHistoricalSession(false);
              break;
            case ExecutionState.TASK_OK:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              break;
            case ExecutionState.TASK_FAIL:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              skip = false;
              break;
            case ExecutionState.TASK_CANCEL:
              setIsFollowUpMode(false);
              setInputEnabled(true);
              setShowStopButton(false);
              skip = false;
              break;
            case ExecutionState.TASK_PAUSE:
            case ExecutionState.TASK_RESUME:
              break;
            default:
              return;
          }
          break;
        case Actors.USER:
          break;
        case Actors.PLANNER:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              break;
            default:
              return;
          }
          break;
        case Actors.NAVIGATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
            case ExecutionState.STEP_CANCEL:
              displayProgress = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              displayProgress = false;
              break;
            case ExecutionState.ACT_START:
              if (content !== 'cache_content') skip = false;
              break;
            case ExecutionState.ACT_OK:
              skip = !isReplayingRef.current;
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            default:
              return;
          }
          break;
        case Actors.VALIDATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            default:
              return;
          }
          break;
        default:
          return;
      }

      if (!skip) {
        appendMessage({
          actor,
          content: content || '',
          timestamp,
        });
      }
      if (displayProgress) {
        appendMessage({
          actor,
          content: progressMessage,
          timestamp,
        });
      }
    },
    [appendMessage],
  );

  const appendOrUpdateStreamingAssistant = useCallback((chunk: string) => {
    setMessages(prev => {
      const next = [...prev];
      const idx = streamingAssistantIndexRef.current;
      if (idx !== null && next[idx] && next[idx].actor === Actors.ASSISTANT) {
        next[idx] = {
          ...next[idx],
          content: next[idx].content + chunk,
          timestamp: Date.now(),
        };
        return next;
      }
      const assistantMsg: Message = {
        actor: Actors.ASSISTANT,
        content: chunk,
        timestamp: Date.now(),
      };
      streamingAssistantIndexRef.current = next.length;
      return [...next, assistantMsg];
    });
  }, []);

  const finalizeStreamingAssistant = useCallback(() => {
    const idx = streamingAssistantIndexRef.current;
    const sessionId = sessionIdRef.current;
    if (idx !== null && sessionId) {
      setMessages(prev => {
        const msg = prev[idx];
        if (msg && msg.actor === Actors.ASSISTANT && msg.content) {
          chatHistoryStore
            .addMessage(sessionId, msg)
            .catch(err => console.error('Failed to save assistant message:', err));
        }
        return prev;
      });
    }
    streamingAssistantIndexRef.current = null;
  }, []);

  const stopConnection = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
  }, []);

  const setupConnection = useCallback(() => {
    if (portRef.current) {
      return;
    }

    try {
      portRef.current = chrome.runtime.connect({ name: 'side-panel-connection' });

      portRef.current.onMessage.addListener((message: any) => {
        if (!message) return;

        // Nanobrowser Executor events (Display Highlights, steps, actions)
        if (message.type === EventType.EXECUTION) {
          handleTaskState(message as AgentEvent);
          return;
        }

        if (!message.type) return;

        switch (message.type) {
          case 'humaticai_typing':
            break;
          case 'humaticai_chunk':
            if (typeof message.content === 'string') {
              appendOrUpdateStreamingAssistant(message.content);
            }
            break;
          case 'humaticai_new_message':
            finalizeStreamingAssistant();
            break;
          case 'humaticai_suggestions':
            if (Array.isArray(message.suggestions)) {
              setSuggestions(message.suggestions);
            }
            break;
          case 'humaticai_system':
            if (message.message) {
              appendMessage({
                actor: Actors.SYSTEM,
                content: message.message,
                timestamp: Date.now(),
              });
            }
            break;
          case 'humaticai_done':
            finalizeStreamingAssistant();
            setInputEnabled(true);
            setShowStopButton(false);
            setIsFollowUpMode(true);
            break;
          case 'humaticai_error':
            finalizeStreamingAssistant();
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.error || t('errors_unknown'),
              timestamp: Date.now(),
            });
            setInputEnabled(true);
            setShowStopButton(false);
            setIsFollowUpMode(true);
            break;
          case 'humaticai_transcribe_result':
            if (pendingTranscribeRef.current) {
              pendingTranscribeRef.current.resolve(typeof message.text === 'string' ? message.text : '');
              pendingTranscribeRef.current = null;
            }
            break;
          case 'humaticai_transcribe_error':
            if (pendingTranscribeRef.current) {
              pendingTranscribeRef.current.reject(new Error(message.error || t('chat_stt_processingFailed')));
              pendingTranscribeRef.current = null;
            }
            break;
          case 'error':
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.error || t('errors_unknown'),
              timestamp: Date.now(),
            });
            setInputEnabled(true);
            setShowStopButton(false);
            break;
          case 'heartbeat_ack':
            break;
          default:
            break;
        }
      });

      portRef.current.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.log('Connection disconnected', error ? `Error: ${error.message}` : '');
        portRef.current = null;
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (pendingTranscribeRef.current) {
          pendingTranscribeRef.current.reject(new Error(t('errors_conn_serviceWorker')));
          pendingTranscribeRef.current = null;
        }
        setInputEnabled(true);
        setShowStopButton(false);
      });

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (portRef.current?.name === 'side-panel-connection') {
          try {
            portRef.current.postMessage({ type: 'heartbeat' });
          } catch (error) {
            console.error('Heartbeat failed:', error);
            stopConnection();
          }
        } else {
          stopConnection();
        }
      }, 25000);
    } catch (error) {
      console.error('Failed to establish connection:', error);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('errors_conn_serviceWorker'),
        timestamp: Date.now(),
      });
      portRef.current = null;
    }
  }, [appendMessage, appendOrUpdateStreamingAssistant, finalizeStreamingAssistant, handleTaskState, stopConnection]);

  const sendMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (portRef.current?.name !== 'side-panel-connection') {
        throw new Error('No valid connection available');
      }
      try {
        portRef.current.postMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        stopConnection();
        throw error;
      }
    },
    [stopConnection],
  );

  const handleSendMessage = async (text: string, displayText?: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    if (isHistoricalSession) {
      console.log('Cannot send messages in historical sessions');
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;

      setInputEnabled(false);
      setShowStopButton(true);
      setSuggestions([]);
      streamingAssistantIndexRef.current = null;

      if (!isFollowUpMode) {
        const titleText = displayText || text;
        const newSession = await chatHistoryStore.createSession(
          titleText.substring(0, 50) + (titleText.length > 50 ? '...' : ''),
        );
        const sessionId = newSession.id;
        setCurrentSessionId(sessionId);
        sessionIdRef.current = sessionId;
      }

      const userMessage: Message = {
        actor: Actors.USER,
        content: displayText || text,
        timestamp: Date.now(),
      };
      appendMessage(userMessage, sessionIdRef.current);

      if (!portRef.current) {
        setupConnection();
      }

      const general = await generalSettingsStore.getSettings();
      if (general.useBrowserAgent) {
        if (!tabId) {
          throw new Error(t('bg_errors_noTabId'));
        }
        // Nanobrowser Executor path — Display Highlights / Vision / Max Steps apply here
        if (isFollowUpMode) {
          await sendMessage({
            type: 'follow_up_task',
            task: text,
            taskId: sessionIdRef.current,
            tabId,
          });
        } else {
          await sendMessage({
            type: 'new_task',
            task: text,
            taskId: sessionIdRef.current,
            tabId,
          });
        }
        return;
      }

      const threadId = sessionIdRef.current ? await humaticaiStore.getThreadId(sessionIdRef.current) : undefined;
      await sendMessage({
        type: 'humaticai_message',
        message: text,
        sessionId: sessionIdRef.current,
        threadId,
        tabId,
        attachPage,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Chat error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setInputEnabled(true);
      setShowStopButton(false);
      stopConnection();
    }
  };

  // Record → Planet 9 /voice/transcribe → put transcript in the chat input (widget parity).
  const requestTranscription = useCallback(
    (base64: string, mimeType: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!portRef.current) {
          setupConnection();
        }
        if (!portRef.current) {
          reject(new Error(t('errors_conn_serviceWorker')));
          return;
        }
        pendingTranscribeRef.current = { resolve, reject };
        try {
          portRef.current.postMessage({
            type: 'humaticai_transcribe',
            audio: base64,
            mimeType: mimeType.split(';', 1)[0],
          });
        } catch (error) {
          pendingTranscribeRef.current = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [setupConnection],
  );

  const handleMicClick = useCallback(async () => {
    if (isProcessingSpeech) return;

    // Second click: stop recording; onstop handler transcribes the clip.
    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size === 0) return;

        setIsProcessingSpeech(true);
        try {
          const base64 = await blobToBase64(blob);
          const text = (await requestTranscription(base64, blob.type || mimeType)).trim();
          if (text && setInputTextRef.current) {
            setInputTextRef.current(prev => {
              const existing = typeof prev === 'string' ? prev : '';
              return existing.trim() ? `${existing.trim()} ${text}` : text;
            });
          }
        } catch (error) {
          console.error('Transcription failed:', error);
          appendMessage({
            actor: Actors.SYSTEM,
            content: error instanceof Error ? error.message : t('chat_stt_processingFailed'),
            timestamp: Date.now(),
          });
        } finally {
          setIsProcessingSpeech(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access failed:', error);
      setIsRecording(false);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_stt_microphone_accessFailed'),
        timestamp: Date.now(),
      });
    }
  }, [isRecording, isProcessingSpeech, requestTranscription, appendMessage]);

  const handleStopTask = async () => {
    try {
      const general = await generalSettingsStore.getSettings();
      if (general.useBrowserAgent) {
        portRef.current?.postMessage({ type: 'cancel_task' });
      } else {
        portRef.current?.postMessage({ type: 'humaticai_cancel' });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('stop task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
    }
    setInputEnabled(true);
    setShowStopButton(false);
  };

  const handleSuggestionClick = (prompt: string) => {
    if (!inputEnabled || isHistoricalSession) return;
    void handleSendMessage(prompt);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setInputEnabled(true);
    setShowStopButton(false);
    setIsFollowUpMode(false);
    setIsHistoricalSession(false);
    setSuggestions([]);
    streamingAssistantIndexRef.current = null;
    stopConnection();
  };

  const loadChatSessions = useCallback(async () => {
    try {
      const sessions = await chatHistoryStore.getSessionsMetadata();
      setChatSessions(sessions.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  }, []);

  const handleLoadHistory = async () => {
    await loadChatSessions();
    setShowHistory(true);
  };

  const handleBackToChat = (reset = false) => {
    setShowHistory(false);
    if (reset) {
      setCurrentSessionId(null);
      setMessages([]);
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);
      setSuggestions([]);
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);
      if (fullSession && fullSession.messages.length > 0) {
        setCurrentSessionId(fullSession.id);
        sessionIdRef.current = fullSession.id;
        setMessages(fullSession.messages);
        setIsFollowUpMode(false);
        setIsHistoricalSession(true);
        setSuggestions([]);
      }
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleSessionDelete = async (sessionId: string) => {
    try {
      await chatHistoryStore.deleteSession(sessionId);
      await humaticaiStore.clearThreadId(sessionId);
      await loadChatSessions();
      if (sessionId === currentSessionId) {
        setMessages([]);
        setCurrentSessionId(null);
        sessionIdRef.current = null;
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleSessionBookmark = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);
      if (fullSession && fullSession.messages.length > 0) {
        const title = fullSession.title.split(' ').slice(0, 8).join(' ');
        const taskContent = fullSession.messages[0]?.content || '';
        await favoritesStorage.addPrompt(title, taskContent);
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
        handleBackToChat(true);
      }
    } catch (error) {
      console.error('Failed to pin session to favorites:', error);
    }
  };

  const handleBookmarkSelect = (content: string) => {
    if (setInputTextRef.current) {
      setInputTextRef.current(content);
    }
  };

  const handleBookmarkUpdateTitle = async (id: number, title: string) => {
    try {
      await favoritesStorage.updatePromptTitle(id, title);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to update favorite prompt title:', error);
    }
  };

  const handleBookmarkDelete = async (id: number) => {
    try {
      await favoritesStorage.removePrompt(id);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to delete favorite prompt:', error);
    }
  };

  const handleBookmarkReorder = async (draggedId: number, targetId: number) => {
    try {
      await favoritesStorage.reorderPrompts(draggedId, targetId);
      const updatedPromptsFromStorage = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(updatedPromptsFromStorage);
    } catch (error) {
      console.error('Failed to reorder favorite prompts:', error);
    }
  };

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
      } catch (error) {
        console.error('Failed to load favorite prompts:', error);
      }
    };
    loadFavorites();
  }, []);

  useEffect(() => {
    return () => {
      stopConnection();
    };
  }, [stopConnection]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, suggestions]);

  return (
    <div className={isDarkMode ? 'dark' : undefined}>
      <div
        className={`flex h-screen flex-col overflow-hidden rounded-2xl border ${
          isDarkMode
            ? 'border-slate-700 bg-slate-950 text-gray-100'
            : 'border-planet9-border bg-planet9-surface text-slate-900'
        }`}>
        <header className={`header relative ${isDarkMode ? 'header--dark' : ''}`}>
          <div className="header-logo">
            {showHistory && (
              <button
                type="button"
                onClick={() => handleBackToChat(false)}
                className={`cursor-pointer ${
                  isDarkMode ? 'text-gray-400 hover:text-gray-100' : 'text-slate-500 hover:text-slate-800'
                }`}
                aria-label={t('nav_back_a11y')}>
                {t('nav_back')}
              </button>
            )}
          </div>
          <div className="header-icons">
            {!showHistory && (
              <>
                <button
                  type="button"
                  onClick={handleNewChat}
                  onKeyDown={e => e.key === 'Enter' && handleNewChat()}
                  className="icon-btn"
                  aria-label={t('nav_newChat_a11y')}
                  title={t('nav_newChat_a11y')}
                  tabIndex={0}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleLoadHistory}
                  onKeyDown={e => e.key === 'Enter' && handleLoadHistory()}
                  className="icon-btn"
                  aria-label={t('nav_loadHistory_a11y')}
                  title={t('nav_loadHistory_a11y')}
                  tabIndex={0}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </>
            )}
            <HeaderMenu isDarkMode={isDarkMode} theme={themePreference} onThemeChange={setThemePreference} />
          </div>
        </header>
        {showHistory ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ChatHistoryList
              sessions={chatSessions}
              onSessionSelect={handleSessionSelect}
              onSessionDelete={handleSessionDelete}
              onSessionBookmark={handleSessionBookmark}
              visible={true}
              isDarkMode={isDarkMode}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {hasApiKey === null && (
              <div
                className={`flex flex-1 flex-col items-center justify-center p-8 ${
                  isDarkMode ? 'text-gray-400' : 'text-slate-500'
                }`}>
                <div className="text-center">
                  <div className="mx-auto mb-3 size-7 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
                  <p className="text-[13px]">{t('status_checkingConfig')}</p>
                </div>
              </div>
            )}

            {hasApiKey === false && (
              <div
                className={`flex flex-1 flex-col items-center justify-center p-8 ${
                  isDarkMode ? 'text-gray-400' : 'text-slate-500'
                }`}>
                <div className="max-w-md text-center">
                  <img src="/icon-128.png" alt="PeerPane Logo" className="mx-auto mb-3 size-10 rounded" />
                  <h3 className={`mb-1.5 text-[15px] font-semibold ${isDarkMode ? 'text-gray-100' : 'text-slate-800'}`}>
                    {t('welcome_title')}
                  </h3>
                  <p className={`mb-4 text-[13px] leading-[1.5] ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                    {t('welcome_instruction')}
                  </p>
                  <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className="my-2 rounded-lg bg-gradient-to-br from-planet9-brand to-planet9-brandTo px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-105">
                    {t('welcome_openSettings')}
                  </button>
                  <div className="mt-3 text-xs">
                    <a
                      href="https://humaticai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        isDarkMode ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'
                      }>
                      {t('welcome_quickStart')}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {hasApiKey === true && (
              <>
                {messages.length === 0 && (
                  <>
                    <div className="mb-2 border-t border-planet9-border p-2 shadow-sm backdrop-blur-sm">
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        onStopTask={handleStopTask}
                        onMicClick={handleMicClick}
                        isRecording={isRecording}
                        isProcessingSpeech={isProcessingSpeech}
                        disabled={!inputEnabled || isHistoricalSession}
                        showStopButton={showStopButton}
                        setContent={setter => {
                          setInputTextRef.current = setter;
                        }}
                        isDarkMode={isDarkMode}
                        attachPage={attachPage}
                        onAttachPageChange={setAttachPage}
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <BookmarkList
                        bookmarks={favoritePrompts}
                        onBookmarkSelect={handleBookmarkSelect}
                        onBookmarkUpdateTitle={handleBookmarkUpdateTitle}
                        onBookmarkDelete={handleBookmarkDelete}
                        onBookmarkReorder={handleBookmarkReorder}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  </>
                )}
                {messages.length > 0 && (
                  <div className="scrollbar-gutter-stable flex-1 overflow-x-hidden overflow-y-scroll scroll-smooth bg-planet9-surface p-2">
                    <MessageList messages={messages} isDarkMode={isDarkMode} />
                    {suggestions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 px-1">
                        {suggestions.map((s, i) => (
                          <button
                            key={`${s.title}-${i}`}
                            type="button"
                            disabled={!inputEnabled}
                            onClick={() => handleSuggestionClick(s.prompt)}
                            className="rounded-xl border border-planet9-border bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-indigo-400 hover:bg-slate-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
                {messages.length > 0 && (
                  <div className="border-t border-planet9-border p-2 shadow-sm backdrop-blur-sm">
                    <ChatInput
                      onSendMessage={handleSendMessage}
                      onStopTask={handleStopTask}
                      onMicClick={handleMicClick}
                      isRecording={isRecording}
                      isProcessingSpeech={isProcessingSpeech}
                      disabled={!inputEnabled || isHistoricalSession}
                      showStopButton={showStopButton}
                      setContent={setter => {
                        setInputTextRef.current = setter;
                      }}
                      isDarkMode={isDarkMode}
                      attachPage={attachPage}
                      onAttachPageChange={setAttachPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
