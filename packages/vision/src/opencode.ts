import { SPECIES_PROMPT, parseBedrockReply } from './bedrock.js';
import type { Classification, FrameInput, SpeciesClassifier } from './index.js';

/**
 * OpenCode adapter for F5 - one photo in, one JSON verdict out:
 *   {"species":"fox","confidence":0.91,"peopleOnly":false}
 * No DB, no second call, no escalation. Called exactly once per saved
 * capture (never on the live-frame refresh). Key from .env.local:
 *   OPENCODE_API_KEY, OPENCODE_VISION_MODEL?, OPENCODE_BASE_URL?
 * Any OpenAI-compatible /chat/completions endpoint with image_url works.
 */
export const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
export const DEFAULT_OPENCODE_VISION_MODEL = 'claude-sonnet-4-5';

export interface OpenCodeClassifierOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function replyText(body: unknown): string {
  const choices = (body as ChatCompletionBody | null)?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part
          ? String((part as { text: unknown }).text ?? '')
          : '',
      )
      .join('');
  }
  throw new Error('OpenCode reply contained no message content');
}

export class OpenCodeSpeciesClassifier implements SpeciesClassifier {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: OpenCodeClassifierOptions) {
    if (!options.apiKey || options.apiKey.trim() === '') {
      throw new Error('OPENCODE_API_KEY must be set');
    }
    this.apiKey = options.apiKey;
    this.modelId = options.model || DEFAULT_OPENCODE_VISION_MODEL;
    this.baseUrl = (options.baseUrl || DEFAULT_OPENCODE_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }
  async classify(frame: FrameInput): Promise<Classification> {
    const base64 = Buffer.from(frame.bytes).toString('base64');
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SPECIES_PROMPT },
              { type: 'image_url', image_url: { url: `data:${frame.contentType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 120,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenCode vision request failed (HTTP ${response.status})`);
    }
    return parseBedrockReply(replyText(await response.json()), this.modelId);
  }
}

export function openCodeClassifierFromEnv(
  env: Record<string, string | undefined>,
): OpenCodeSpeciesClassifier {
  const apiKey = env.OPENCODE_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENCODE_API_KEY must be set');
  return new OpenCodeSpeciesClassifier({
    apiKey,
    model: env.OPENCODE_VISION_MODEL?.trim() || undefined,
    baseUrl: env.OPENCODE_BASE_URL?.trim() || undefined,
  });
}
