/**
 * Planet 9 (Humatic AI) chat-model adapter.
 *
 * Wraps the Planet 9 `/chat/stream` API in a LangChain `SimpleChatModel` so the
 * browser-agent Executor can drive Planet 9 exactly like an LLM: the current
 * prompt (DOM/HTML tags + request) is sent "as to an LLM" and the streamed text
 * is returned as the assistant message.
 *
 * Context is kept server-side: Planet 9 maintains the thread behind the endpoint,
 * so we send ONLY the latest message each call and reuse the returned `thread_id`
 * on subsequent calls — we never re-serialize the whole conversation.
 *
 * Agents route this model through their manual JSON-extraction path (see
 * `agents/base.ts` -> `setWithStructuredOutput`, which treats the `planet9`
 * model name as non-structured). Real action execution depends on the future
 * Planet 9 protocol extension returning structured actions; until then this
 * adapter carries the same request shape and parses whatever JSON Planet 9
 * returns.
 */
import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { streamChat, type HumaticAIImage } from '../services/humaticai';

export interface Planet9ChatModelFields extends BaseChatModelParams {
  apiKey: string;
  baseUrl: string;
  userId: string;
}

function parseDataUrl(url: string): HumaticAIImage | null {
  if (!url.startsWith('data:')) return null;
  const [header, data] = url.split(',');
  if (!data) return null;
  const mimeMatch = header.match(/data:([^;]+)/);
  return { data, mime_type: mimeMatch?.[1] || 'image/png' };
}

/** Extract text + inline images from a single message's content. */
function extractMessageContent(message: BaseMessage): { text: string; images: HumaticAIImage[] } {
  const content = message.content;
  const images: HumaticAIImage[] = [];

  if (typeof content === 'string') {
    return { text: content, images };
  }

  if (Array.isArray(content)) {
    const textChunks: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        textChunks.push(item);
      } else if (item && typeof item === 'object' && 'type' in item) {
        if (item.type === 'text' && typeof (item as { text?: string }).text === 'string') {
          textChunks.push((item as { text: string }).text);
        } else if (item.type === 'image_url') {
          const raw = (item as { image_url?: string | { url?: string } }).image_url;
          const url = typeof raw === 'string' ? raw : raw?.url;
          const image = url ? parseDataUrl(url) : null;
          if (image) images.push(image);
        }
      }
    }
    return { text: textChunks.join('\n'), images };
  }

  return { text: '', images };
}

export class Planet9ChatModel extends SimpleChatModel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly userId: string;
  /** Server-issued thread id — reused across calls so Planet 9 keeps context. */
  private threadId?: string;
  /** Exposed so `agents/base.ts` reads it via `getModelName()` and picks the manual-JSON path. */
  modelName = 'planet9';

  constructor(fields: Planet9ChatModelFields) {
    super(fields);
    this.apiKey = fields.apiKey;
    this.baseUrl = fields.baseUrl;
    this.userId = fields.userId;
  }

  _llmType(): string {
    return 'planet9';
  }

  async _call(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<string> {
    // Planet 9 keeps context behind the endpoint, so send only the latest
    // message and rely on the server-side thread for history.
    const latest = messages[messages.length - 1];
    const { text, images } = latest ? extractMessageContent(latest) : { text: '', images: [] };

    let content = '';
    let errorMessage: string | null = null;

    await streamChat(
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        message: text,
        userId: this.userId,
        threadId: this.threadId,
        images: images.length > 0 ? images : undefined,
        signal: options.signal,
      },
      event => {
        if (event.type === 'content') {
          content += event.content;
        } else if (event.type === 'done') {
          if (event.threadId) this.threadId = event.threadId;
        } else if (event.type === 'error') {
          errorMessage = event.message;
        }
      },
    );

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return content;
  }
}

export function createPlanet9ChatModel(fields: Planet9ChatModelFields): Planet9ChatModel {
  return new Planet9ChatModel(fields);
}
