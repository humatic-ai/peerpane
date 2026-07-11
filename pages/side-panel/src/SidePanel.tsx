/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { FiSettings } from 'react-icons/fi';
import { PiPlusBold } from 'react-icons/pi';
import { GrHistory } from 'react-icons/gr';
import { type Message, Actors, chatHistoryStore, humaticaiStore } from '@extension/storage';
import favoritesStorage, { type FavoritePrompt } from '@extension/storage/lib/prompt/favorites';
import { t } from '@extension/i18n';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import BookmarkList from './components/BookmarkList';
import './SidePanel.css';

interface Suggestion {
  title: string;
  prompt: string;
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [attachPage, setAttachPage] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);
  const streamingAssistantIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    darkModeMediaQuery.addEventListener('change', handleChange);
    return () => darkModeMediaQuery.removeEventListener('change', handleChange);
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
    setMessages(prev => [...prev, newMessage]);

    const effectiveSessionId = sessionId !== undefined ? sessionId : sessionIdRef.current;
    if (effectiveSessionId) {
      chatHistoryStore
        .addMessage(effectiveSessionId, newMessage)
        .catch(err => console.error('Failed to save message to history:', err));
    }
  }, []);

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
        if (!message || !message.type) return;

        switch (message.type) {
          case 'humaticai_typing':
            // Could show a typing indicator; chunks will follow
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
  }, [appendMessage, appendOrUpdateStreamingAssistant, finalizeStreamingAssistant, stopConnection]);

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

  const handleStopTask = async () => {
    try {
      portRef.current?.postMessage({ type: 'humaticai_cancel' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('humaticai_cancel error', errorMessage);
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
    <div>
      <div
        className={`flex h-screen flex-col ${isDarkMode ? 'bg-slate-900' : "bg-[url('/bg.jpg')] bg-cover bg-no-repeat"} overflow-hidden border ${isDarkMode ? 'border-sky-800' : 'border-[rgb(186,230,253)]'} rounded-2xl`}>
        <header className="header relative">
          <div className="header-logo">
            {showHistory ? (
              <button
                type="button"
                onClick={() => handleBackToChat(false)}
                className={`${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                aria-label={t('nav_back_a11y')}>
                {t('nav_back')}
              </button>
            ) : (
              <img src="/icon-128.png" alt="PeerPane" className="size-6 rounded" />
            )}
          </div>
          <div className="header-icons">
            {!showHistory && (
              <>
                <button
                  type="button"
                  onClick={handleNewChat}
                  onKeyDown={e => e.key === 'Enter' && handleNewChat()}
                  className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                  aria-label={t('nav_newChat_a11y')}
                  tabIndex={0}>
                  <PiPlusBold size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleLoadHistory}
                  onKeyDown={e => e.key === 'Enter' && handleLoadHistory()}
                  className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                  aria-label={t('nav_loadHistory_a11y')}
                  tabIndex={0}>
                  <GrHistory size={20} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage()}
              onKeyDown={e => e.key === 'Enter' && chrome.runtime.openOptionsPage()}
              className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
              aria-label={t('nav_settings_a11y')}
              tabIndex={0}>
              <FiSettings size={20} />
            </button>
          </div>
        </header>
        {showHistory ? (
          <div className="flex-1 overflow-hidden">
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
          <>
            {hasApiKey === null && (
              <div
                className={`flex flex-1 items-center justify-center p-8 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                <div className="text-center">
                  <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"></div>
                  <p>{t('status_checkingConfig')}</p>
                </div>
              </div>
            )}

            {hasApiKey === false && (
              <div
                className={`flex flex-1 items-center justify-center p-8 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                <div className="max-w-md text-center">
                  <img src="/icon-128.png" alt="PeerPane Logo" className="mx-auto mb-4 size-12 rounded" />
                  <h3 className={`mb-2 text-lg font-semibold ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}>
                    {t('welcome_title')}
                  </h3>
                  <p className="mb-4">{t('welcome_instruction')}</p>
                  <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className={`my-4 rounded-lg px-4 py-2 font-medium transition-colors ${
                      isDarkMode ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-500 text-white hover:bg-sky-600'
                    }`}>
                    {t('welcome_openSettings')}
                  </button>
                  <div className="mt-4 text-sm opacity-75">
                    <a
                      href="https://humaticai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-700 hover:text-sky-600'}`}>
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
                    <div
                      className={`border-t ${isDarkMode ? 'border-sky-900' : 'border-sky-100'} mb-2 p-2 shadow-sm backdrop-blur-sm`}>
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        onStopTask={handleStopTask}
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
                  <div
                    className={`scrollbar-gutter-stable flex-1 overflow-x-hidden overflow-y-scroll scroll-smooth p-2 ${isDarkMode ? 'bg-slate-900/80' : ''}`}>
                    <MessageList messages={messages} isDarkMode={isDarkMode} />
                    {suggestions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 px-1">
                        {suggestions.map((s, i) => (
                          <button
                            key={`${s.title}-${i}`}
                            type="button"
                            disabled={!inputEnabled}
                            onClick={() => handleSuggestionClick(s.prompt)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              isDarkMode
                                ? 'border-sky-700 bg-slate-800 text-sky-300 hover:bg-slate-700'
                                : 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50'
                            } disabled:cursor-not-allowed disabled:opacity-50`}>
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
                {messages.length > 0 && (
                  <div
                    className={`border-t ${isDarkMode ? 'border-sky-900' : 'border-sky-100'} p-2 shadow-sm backdrop-blur-sm`}>
                    <ChatInput
                      onSendMessage={handleSendMessage}
                      onStopTask={handleStopTask}
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
          </>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
