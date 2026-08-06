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
import { t } from '@extension/i18n';
import { LuMessageSquarePlus, LuHistory, LuArrowDown, LuArrowLeft } from 'react-icons/lu';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import HeaderMenu from './components/HeaderMenu';
import ComposerTooltip from './components/ComposerTooltip';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import './SidePanel.css';

const progressMessage = 'Showing progress...';
const AUTO_SCROLL_PAUSE_THRESHOLD_PX = 80;

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
  const pendingSynthesizeRef = useRef<{
    resolve: (result: { audioBase64: string; mimeType: string }) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const followBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
      if (!configured) {
        setShowHistory(false);
      }
    } catch (error) {
      console.error('Error checking Humatic AI configuration:', error);
      setHasApiKey(false);
      setShowHistory(false);
    }
  }, []);

  useEffect(() => {
    checkApiKeyConfiguration();
  }, [checkApiKeyConfiguration]);

  // Re-check when Planet 9 settings change (e.g. API key saved/cleared in Options).
  useEffect(() => {
    const unsub = humaticaiStore.subscribe(() => {
      void checkApiKeyConfiguration();
    });
    return unsub;
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
          case 'humaticai_synthesize_result':
            if (pendingSynthesizeRef.current) {
              pendingSynthesizeRef.current.resolve({
                audioBase64: typeof message.audio === 'string' ? message.audio : '',
                mimeType: typeof message.mimeType === 'string' ? message.mimeType : 'audio/mpeg',
              });
              pendingSynthesizeRef.current = null;
            }
            break;
          case 'humaticai_synthesize_error':
            if (pendingSynthesizeRef.current) {
              pendingSynthesizeRef.current.reject(new Error(message.error || t('chat_tooltip_readAloudError')));
              pendingSynthesizeRef.current = null;
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
        if (pendingSynthesizeRef.current) {
          pendingSynthesizeRef.current.reject(new Error(t('errors_conn_serviceWorker')));
          pendingSynthesizeRef.current = null;
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
      followBottomRef.current = true;
      setShowJumpToLatest(false);

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

  const requestSynthesizeSpeech = useCallback(
    (text: string): Promise<{ audioBase64: string; mimeType: string }> => {
      return new Promise((resolve, reject) => {
        if (!portRef.current) {
          setupConnection();
        }
        if (!portRef.current) {
          reject(new Error(t('errors_conn_serviceWorker')));
          return;
        }
        pendingSynthesizeRef.current = { resolve, reject };
        try {
          portRef.current.postMessage({
            type: 'humaticai_synthesize',
            text,
          });
        } catch (error) {
          pendingSynthesizeRef.current = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [setupConnection],
  );

  const startRecording = useCallback(async () => {
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
  }, [requestTranscription, appendMessage]);

  const openMicPermissionDialog = useCallback(() => {
    const permissionUrl = chrome.runtime.getURL('permission/index.html');
    chrome.windows.create(
      {
        url: permissionUrl,
        type: 'popup',
        width: 420,
        height: 480,
      },
      createdWindow => {
        if (!createdWindow?.id) return;
        const windowId = createdWindow.id;
        const onWindowClose = (closedId: number) => {
          if (closedId !== windowId) return;
          chrome.windows.onRemoved.removeListener(onWindowClose);
          window.setTimeout(async () => {
            try {
              const status = await navigator.permissions.query({
                name: 'microphone' as PermissionName,
              });
              if (status.state === 'granted') {
                await startRecording();
              }
            } catch (error) {
              console.error('Failed to check microphone permission after grant dialog:', error);
            }
          }, 500);
        };
        chrome.windows.onRemoved.addListener(onWindowClose);
      },
    );
  }, [startRecording]);

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
      // Side panel cannot reliably show Chrome's mic prompt — open the
      // extension permission page so getUserMedia triggers the native dialog.
      let permissionState: PermissionState | 'unknown' = 'unknown';
      try {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        permissionState = status.state;
      } catch {
        // permissions.query(microphone) unsupported — fall through to getUserMedia
      }

      if (permissionState === 'denied') {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_stt_microphone_permissionDenied'),
          timestamp: Date.now(),
        });
        return;
      }

      if (permissionState !== 'granted') {
        openMicPermissionDialog();
        return;
      }

      await startRecording();
    } catch (error) {
      console.error('Microphone access failed:', error);
      setIsRecording(false);
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        openMicPermissionDialog();
        return;
      }
      appendMessage({
        actor: Actors.SYSTEM,
        content: name === 'NotFoundError' ? t('chat_stt_microphone_notFound') : t('chat_stt_microphone_accessFailed'),
        timestamp: Date.now(),
      });
    }
  }, [isRecording, isProcessingSpeech, startRecording, openMicPermissionDialog, appendMessage]);

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
    followBottomRef.current = true;
    setShowJumpToLatest(false);
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

  // Preview / deep-link: open chat history when ?history=1 (used by preview.html board).
  useEffect(() => {
    if (hasApiKey !== true) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('history') !== '1') return;
    } catch {
      return;
    }
    let cancelled = false;
    void (async () => {
      await loadChatSessions();
      if (!cancelled) setShowHistory(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasApiKey, loadChatSessions]);

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

  useEffect(() => {
    return () => {
      stopConnection();
    };
  }, [stopConnection]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < AUTO_SCROLL_PAUSE_THRESHOLD_PX;
    followBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom && el.scrollHeight > el.clientHeight);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    followBottomRef.current = true;
    setShowJumpToLatest(false);
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (!followBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, suggestions]);

  return (
    <div className={isDarkMode ? 'dark' : undefined}>
      <div
        className={`flex h-screen w-full flex-col overflow-hidden rounded-2xl border ${
          isDarkMode
            ? 'border-slate-700 bg-slate-950 text-gray-100'
            : 'border-planet9-border bg-planet9-surface text-slate-900'
        }`}>
        <header className={`header relative ${isDarkMode ? 'header--dark' : ''}`}>
          <div className="header-logo">
            {showHistory && (
              <ComposerTooltip content={t('chat_tooltip_back')} side="bottom">
                <button
                  type="button"
                  onClick={() => handleBackToChat(false)}
                  className="icon-btn"
                  aria-label={t('chat_tooltip_back')}>
                  <LuArrowLeft size={18} strokeWidth={2} aria-hidden />
                </button>
              </ComposerTooltip>
            )}
          </div>
          <div className="header-icons">
            {!showHistory && hasApiKey === true && (
              <>
                <ComposerTooltip content={t('chat_tooltip_newChat')} side="bottom">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    onKeyDown={e => e.key === 'Enter' && handleNewChat()}
                    className="icon-btn"
                    aria-label={t('chat_tooltip_newChat')}
                    tabIndex={0}>
                    <LuMessageSquarePlus size={18} strokeWidth={2} aria-hidden />
                  </button>
                </ComposerTooltip>
                <ComposerTooltip content={t('chat_tooltip_history')} side="bottom">
                  <button
                    type="button"
                    onClick={handleLoadHistory}
                    onKeyDown={e => e.key === 'Enter' && handleLoadHistory()}
                    className="icon-btn"
                    aria-label={t('chat_tooltip_history')}
                    tabIndex={0}>
                    <LuHistory size={18} strokeWidth={2} aria-hidden />
                  </button>
                </ComposerTooltip>
              </>
            )}
            <HeaderMenu isDarkMode={isDarkMode} theme={themePreference} onThemeChange={setThemePreference} />
          </div>
        </header>
        {showHistory && hasApiKey === true ? (
          <div className="flex min-h-0 w-full flex-1 overflow-hidden">
            <ChatHistoryList
              sessions={chatSessions}
              onSessionSelect={handleSessionSelect}
              onSessionDelete={handleSessionDelete}
              visible={true}
              isDarkMode={isDarkMode}
              activeSessionId={currentSessionId}
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
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div
                    ref={messagesScrollRef}
                    onScroll={handleMessagesScroll}
                    className="scrollbar-gutter-stable flex-1 overflow-x-hidden overflow-y-scroll scroll-smooth bg-white px-3 pt-4 pb-2">
                    {messages.length > 0 && (
                      <>
                        <MessageList
                          messages={messages}
                          isDarkMode={isDarkMode}
                          onSynthesizeSpeech={requestSynthesizeSpeech}
                        />
                        {suggestions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 px-1">
                            {suggestions.map((s, i) => (
                              <button
                                key={`${s.title}-${i}`}
                                type="button"
                                disabled={!inputEnabled}
                                onClick={() => handleSuggestionClick(s.prompt)}
                                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-indigo-400 hover:bg-gray-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">
                                {s.title}
                              </button>
                            ))}
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>
                  {showJumpToLatest && (
                    <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3">
                      <div className="flex w-full max-w-full justify-end pr-1">
                        <ComposerTooltip content={t('chat_tooltip_jumpToLatest')}>
                          <button
                            type="button"
                            onClick={() => scrollToLatest('smooth')}
                            className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:opacity-40 disabled:pointer-events-none text-gray-700 border border-white/60 bg-white/45 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_2px_6px_rgba(15,23,42,0.05)] hover:border-white/75 hover:bg-white/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_3px_8px_rgba(15,23,42,0.07)] transition-all"
                            aria-label={t('chat_tooltip_jumpToLatest')}>
                            <LuArrowDown size={11} strokeWidth={2.5} aria-hidden />
                          </button>
                        </ComposerTooltip>
                      </div>
                    </div>
                  )}
                </div>
                <div className="message-input-shell px-3 pt-2 pb-2">
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
