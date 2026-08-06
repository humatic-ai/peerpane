/**
 * Humatic AI public chat streaming client.
 * Speaks the X-API-Key /chat/stream SSE contract (WIDGET.md).
 */

export interface HumaticAIImage {
  data: string; // raw base64, no data: prefix
  mime_type?: string;
}

export interface StreamChatParams {
  baseUrl: string;
  apiKey: string;
  message: string;
  userId: string;
  threadId?: string;
  images?: HumaticAIImage[];
  signal?: AbortSignal;
}

export interface TranscribeAudioParams {
  baseUrl: string;
  apiKey: string;
  /** Raw audio bytes (Blob or ArrayBuffer). */
  audio: Blob | ArrayBuffer;
  /** MIME type without codec suffix, e.g. audio/webm */
  mimeType?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface TranscribeAudioResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface SynthesizeSpeechParams {
  baseUrl: string;
  apiKey: string;
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  signal?: AbortSignal;
}

export interface HumaticAISuggestion {
  title: string;
  prompt: string;
}

export type HumaticAIStreamEvent =
  | { type: 'typing' }
  | { type: 'content'; content: string }
  | { type: 'new_message' }
  | { type: 'suggestions'; suggestions: HumaticAISuggestion[] }
  | { type: 'system'; category: string; message: string }
  | { type: 'done'; threadId?: string; userId?: string }
  | { type: 'error'; message: string };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Stream a chat turn from Humatic AI. Invokes onEvent for each normalized frame.
 */
export async function streamChat(
  params: StreamChatParams,
  onEvent: (event: HumaticAIStreamEvent) => void,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!params.apiKey?.trim()) {
    onEvent({ type: 'error', message: 'Humatic AI API key is not configured' });
    return;
  }
  if (!params.message?.trim() && !(params.images && params.images.length > 0)) {
    onEvent({ type: 'error', message: 'Message is empty' });
    return;
  }

  const body: Record<string, unknown> = {
    message: params.message ?? '',
    user_id: params.userId,
  };
  if (params.threadId) {
    body.thread_id = params.threadId;
  }
  if (params.images && params.images.length > 0) {
    body.images = params.images.map(img => ({
      data: img.data,
      mime_type: img.mime_type || 'image/png',
    }));
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': params.apiKey,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) {
      return;
    }
    onEvent({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to reach Humatic AI',
    });
    return;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.text();
      if (errBody) {
        detail = `${detail}: ${errBody.slice(0, 300)}`;
      }
    } catch {
      // ignore
    }
    onEvent({ type: 'error', message: detail });
    return;
  }

  if (!response.body) {
    onEvent({ type: 'error', message: 'Empty response body from Humatic AI' });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  try {
    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trimStart();
        if (!payload || payload === '[DONE]') continue;

        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Keep-alive
        if (frame.ping) continue;

        if (frame.typing) {
          onEvent({ type: 'typing' });
          continue;
        }

        if (frame.system_event && typeof frame.system_event === 'object') {
          const se = frame.system_event as { category?: string; message?: string };
          onEvent({
            type: 'system',
            category: se.category || 'info',
            message: se.message || '',
          });
        }

        if (typeof frame.content === 'string' && frame.content.length > 0) {
          onEvent({ type: 'content', content: frame.content });
        }

        // Both frames are sub-turn boundaries: `message_complete` finalizes the
        // current bubble (emitted before a tool runs), `new_message` starts a new
        // one. In our model, finalize-and-lazy-recreate handles both; consumers
        // de-dupe consecutive boundaries.
        if (frame.message_complete || frame.new_message) {
          onEvent({ type: 'new_message' });
        }

        if (Array.isArray(frame.suggestions)) {
          const suggestions = (frame.suggestions as Array<{ title?: string; prompt?: string }>)
            .filter(s => s && (s.title || s.prompt))
            .map(s => ({
              title: s.title || s.prompt || '',
              prompt: s.prompt || s.title || '',
            }));
          if (suggestions.length > 0) {
            onEvent({ type: 'suggestions', suggestions });
          }
        }

        if (frame.done === true) {
          sawDone = true;
          onEvent({
            type: 'done',
            threadId: typeof frame.thread_id === 'string' ? frame.thread_id : undefined,
            userId: typeof frame.user_id === 'string' ? frame.user_id : undefined,
          });
        }
      }
    }
  } catch (err) {
    if (params.signal?.aborted) {
      return;
    }
    onEvent({
      type: 'error',
      message: err instanceof Error ? err.message : 'Stream interrupted',
    });
    return;
  }

  if (!sawDone) {
    // Stream ended without an explicit done frame — still signal completion
    onEvent({ type: 'done' });
  }
}

/**
 * Probe Humatic AI health endpoint.
 */
export async function testConnection(
  baseUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> {
  const url = `${normalizeBaseUrl(baseUrl)}/health`;
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) {
      headers['X-API-Key'] = apiKey.trim();
    }
    const response = await fetch(url, { method: 'GET', headers, signal });
    if (response.ok) {
      return { ok: true, message: `Connected (${response.status})` };
    }
    return { ok: false, message: `Health check failed: HTTP ${response.status}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

/**
 * Speech → text via Planet 9 public STT (`POST /voice/transcribe`).
 * Raw audio body + Content-Type MIME; returns OpenAI-Whisper-compatible JSON.
 */
export async function transcribeAudio(params: TranscribeAudioParams): Promise<TranscribeAudioResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!params.apiKey?.trim()) {
    throw new Error('Humatic AI API key is not configured');
  }

  const mimeType = (params.mimeType || 'audio/webm').split(';', 1)[0].trim().toLowerCase() || 'audio/webm';
  const url = new URL(`${baseUrl}/voice/transcribe`);
  if (params.language) {
    url.searchParams.set('language', params.language);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-API-Key': params.apiKey,
    },
    body: params.audio,
    signal: params.signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.text();
      if (errBody) detail = `${detail}: ${errBody.slice(0, 300)}`;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  const data = (await response.json()) as { text?: string; language?: string; duration?: number };
  return {
    text: typeof data.text === 'string' ? data.text : '',
    language: typeof data.language === 'string' ? data.language : undefined,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
  };
}

/**
 * Text → speech via Planet 9 public TTS (`POST /voice/synthesize`).
 * Returns MP3 bytes (audio/mpeg).
 */
export async function synthesizeSpeech(params: SynthesizeSpeechParams): Promise<ArrayBuffer> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!params.apiKey?.trim()) {
    throw new Error('Humatic AI API key is not configured');
  }
  const text = params.text?.trim();
  if (!text) {
    throw new Error('Text is empty');
  }

  const body: Record<string, unknown> = { text };
  if (params.voice) body.voice = params.voice;
  if (typeof params.rate === 'number') body.rate = params.rate;
  if (typeof params.pitch === 'number') body.pitch = params.pitch;

  const response = await fetch(`${baseUrl}/voice/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': params.apiKey,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.text();
      if (errBody) detail = `${detail}: ${errBody.slice(0, 300)}`;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return response.arrayBuffer();
}
