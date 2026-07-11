import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  analyticsSettingsStore,
  humaticaiStore,
  userStore,
} from '@extension/storage';
import { t } from '@extension/i18n';
import BrowserContext from './browser/context';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { ExecutionState } from './agent/event/types';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
import { SpeechToTextService } from './services/speechToText';
import { injectBuildDomTreeScripts } from './browser/dom/service';
import { analytics } from './services/analytics';
import { streamChat, type HumaticAIImage } from './services/humaticai';

const logger = createLogger('background');

const browserContext = new BrowserContext({});
let currentExecutor: Executor | null = null;
let currentPort: chrome.runtime.Port | null = null;
let humaticaiAbortController: AbortController | null = null;
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId && changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    await injectBuildDomTreeScripts(tabId);
  }
});

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  browserContext.removeAttachedPage(tabId);
});

logger.info('background loaded');

// Initialize analytics
analytics.init().catch(error => {
  logger.error('Failed to initialize analytics:', error);
});

// Listen for analytics settings changes
analyticsSettingsStore.subscribe(() => {
  analytics.updateSettings().catch(error => {
    logger.error('Failed to update analytics settings:', error);
  });
});

// Listen for simple messages (e.g., from options page)
chrome.runtime.onMessage.addListener(() => {
  // Handle other message types if needed in the future
});

function postToSidePanel(message: Record<string, unknown>) {
  try {
    if (currentPort) {
      currentPort.postMessage(message);
    }
  } catch (error) {
    logger.error('Failed to send message to side panel:', error);
  }
}

async function handleHumaticAIMessage(message: {
  message?: string;
  sessionId?: string;
  threadId?: string;
  images?: HumaticAIImage[];
  attachPage?: boolean;
  tabId?: number;
}) {
  const settings = await humaticaiStore.getSettings();
  if (!settings.apiKey?.trim()) {
    postToSidePanel({ type: 'humaticai_error', error: t('bg_setup_noApiKeys') });
    return;
  }

  const userId = await userStore.getUserId();
  const sessionId = message.sessionId;
  let threadId = message.threadId;
  if (!threadId && sessionId) {
    threadId = await humaticaiStore.getThreadId(sessionId);
  }

  let chatMessage = message.message || '';
  const images: HumaticAIImage[] = [...(message.images || [])];

  // Optionally attach current page screenshot + URL/title/text
  if (message.attachPage && message.tabId) {
    try {
      const pageContext = await capturePageContext(message.tabId);
      if (pageContext.screenshot) {
        images.push(pageContext.screenshot);
      }
      if (pageContext.textBlock) {
        chatMessage = chatMessage ? `${chatMessage}\n\n${pageContext.textBlock}` : pageContext.textBlock;
      }
    } catch (error) {
      logger.error('Failed to attach page context:', error);
    }
  }

  // Cancel any in-flight stream
  humaticaiAbortController?.abort();
  humaticaiAbortController = new AbortController();
  const signal = humaticaiAbortController.signal;

  await streamChat(
    {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      message: chatMessage,
      userId,
      threadId,
      images: images.length > 0 ? images : undefined,
      provider: settings.provider,
      model: settings.model,
      useRag: settings.useRag,
      signal,
    },
    event => {
      switch (event.type) {
        case 'typing':
          postToSidePanel({ type: 'humaticai_typing' });
          break;
        case 'content':
          postToSidePanel({ type: 'humaticai_chunk', content: event.content });
          break;
        case 'new_message':
          postToSidePanel({ type: 'humaticai_new_message' });
          break;
        case 'suggestions':
          postToSidePanel({ type: 'humaticai_suggestions', suggestions: event.suggestions });
          break;
        case 'system':
          postToSidePanel({
            type: 'humaticai_system',
            category: event.category,
            message: event.message,
          });
          break;
        case 'done':
          if (event.threadId && sessionId) {
            humaticaiStore.setThreadId(sessionId, event.threadId).catch(err => {
              logger.error('Failed to persist thread_id:', err);
            });
          }
          postToSidePanel({
            type: 'humaticai_done',
            threadId: event.threadId,
            userId: event.userId,
            sessionId,
          });
          humaticaiAbortController = null;
          break;
        case 'error':
          postToSidePanel({ type: 'humaticai_error', error: event.message });
          humaticaiAbortController = null;
          break;
      }
    },
  );
}

async function capturePageContext(tabId: number): Promise<{
  screenshot?: HumaticAIImage;
  textBlock?: string;
}> {
  const result: { screenshot?: HumaticAIImage; textBlock?: string } = {};

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (dataUrl?.startsWith('data:')) {
      const [header, data] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      result.screenshot = {
        data,
        mime_type: mimeMatch?.[1] || 'image/png',
      };
    }
  } catch (error) {
    logger.error('captureVisibleTab failed:', error);
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const [{ result: pageInfo }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const text = (document.body?.innerText || '').slice(0, 8000);
        return {
          url: location.href,
          title: document.title,
          text,
        };
      },
    });
    if (pageInfo) {
      result.textBlock = [
        '[Current page context]',
        `URL: ${pageInfo.url || tab.url || ''}`,
        `Title: ${pageInfo.title || tab.title || ''}`,
        pageInfo.text ? `Visible text:\n${pageInfo.text}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } else if (tab.url) {
      result.textBlock = `[Current page context]\nURL: ${tab.url}\nTitle: ${tab.title || ''}`;
    }
  } catch (error) {
    logger.error('Failed to extract page text:', error);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        result.textBlock = `[Current page context]\nURL: ${tab.url}\nTitle: ${tab.title || ''}`;
      }
    } catch {
      // ignore
    }
  }

  return result;
}

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    const senderUrl = port.sender?.url;
    const senderId = port.sender?.id;

    if (!senderUrl || senderId !== chrome.runtime.id || senderUrl !== SIDE_PANEL_URL) {
      logger.warning('Blocked unauthorized side-panel-connection', senderId, senderUrl);
      port.disconnect();
      return;
    }

    currentPort = port;

    port.onMessage.addListener(async message => {
      try {
        switch (message.type) {
          case 'heartbeat':
            port.postMessage({ type: 'heartbeat_ack' });
            break;

          case 'humaticai_message': {
            await handleHumaticAIMessage(message);
            break;
          }

          case 'humaticai_cancel': {
            humaticaiAbortController?.abort();
            humaticaiAbortController = null;
            port.postMessage({ type: 'humaticai_done', cancelled: true });
            break;
          }

          case 'new_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('new_task', message.tabId, message.task);
            currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
            subscribeToExecutorEvents(currentExecutor);

            const result = await currentExecutor.execute();
            logger.info('new_task execution result', message.tabId, result);
            break;
          }

          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('follow_up_task', message.tabId, message.task);

            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_cleaned') });
            }
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.cancel();
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_cmd_resumeTask_noTask') });
            await currentExecutor.resume();
            return port.postMessage({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.pause();
            return port.postMessage({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'state': {
            try {
              const browserState = await browserContext.getState(true);
              const elementsText = browserState.elementTree.clickableElementsToString(
                DEFAULT_AGENT_OPTIONS.includeAttributes,
              );

              logger.info('state', browserState);
              logger.info('interactive elements', elementsText);
              return port.postMessage({ type: 'success', msg: t('bg_cmd_state_printed') });
            } catch (error) {
              logger.error('Failed to get state:', error);
              return port.postMessage({ type: 'error', error: t('bg_cmd_state_failed') });
            }
          }

          case 'nohighlight': {
            const page = await browserContext.getCurrentPage();
            await page.removeHighlight();
            return port.postMessage({ type: 'success', msg: t('bg_cmd_nohighlight_ok') });
          }

          case 'speech_to_text': {
            try {
              if (!message.audio) {
                return port.postMessage({
                  type: 'speech_to_text_error',
                  error: t('bg_cmd_stt_noAudioData'),
                });
              }

              logger.info('Processing speech-to-text request...');

              const providers = await llmProviderStore.getAllProviders();
              const speechToTextService = await SpeechToTextService.create(providers);

              let base64Audio = message.audio;
              if (base64Audio.startsWith('data:')) {
                base64Audio = base64Audio.split(',')[1];
              }

              const transcribedText = await speechToTextService.transcribeAudio(base64Audio);

              logger.info('Speech-to-text completed successfully');
              return port.postMessage({
                type: 'speech_to_text_result',
                text: transcribedText,
              });
            } catch (error) {
              logger.error('Speech-to-text failed:', error);
              return port.postMessage({
                type: 'speech_to_text_error',
                error: error instanceof Error ? error.message : t('bg_cmd_stt_failed'),
              });
            }
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            if (!message.taskId) return port.postMessage({ type: 'error', error: t('bg_errors_noTaskId') });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: t('bg_cmd_replay_noHistory') });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              await browserContext.switchTab(message.tabId);
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
              subscribeToExecutorEvents(currentExecutor);

              const result = await currentExecutor.replayHistory(message.historySessionId);
              logger.debug('replay execution result', message.tabId, result);
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('bg_cmd_replay_failed'),
              });
            }
            break;
          }

          default:
            return port.postMessage({ type: 'error', error: t('errors_cmd_unknown', [message.type]) });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : t('errors_unknown'),
        });
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('Side panel disconnected');
      currentPort = null;
      humaticaiAbortController?.abort();
      humaticaiAbortController = null;
      currentExecutor?.cancel();
    });
  }
});

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  const providers = await llmProviderStore.getAllProviders();
  if (Object.keys(providers).length === 0) {
    throw new Error(t('bg_setup_noApiKeys'));
  }

  await agentModelStore.cleanupLegacyValidatorSettings();

  const agentModels = await agentModelStore.getAllAgentModels();
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(t('bg_setup_noProvider', [agentModel.provider]));
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error(t('bg_setup_noNavigatorModel'));
  }
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
    displayHighlights: generalSettings.displayHighlights,
  });

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      useVision: generalSettings.useVision,
      useVisionForPlanner: true,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
  });

  return executor;
}

async function subscribeToExecutorEvents(executor: Executor) {
  executor.clearExecutionEvents();

  executor.subscribeExecutionEvents(async event => {
    try {
      if (currentPort) {
        currentPort.postMessage(event);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      event.state === ExecutionState.TASK_OK ||
      event.state === ExecutionState.TASK_FAIL ||
      event.state === ExecutionState.TASK_CANCEL
    ) {
      await currentExecutor?.cleanup();
    }
  });
}
