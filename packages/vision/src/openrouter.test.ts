import { describe, expect, it } from 'vitest';
import type { FrameInput } from './index.js';
import {
  OpenRouterSpeciesClassifier,
  openRouterClassifierFromEnv,
  parseOpenRouterReply,
} from './openrouter.js';

const frame: FrameInput = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  contentType: 'image/jpeg',
};

describe('OpenRouter adapter - identifying the animal from a screenshot', () => {
  it('parses a species reply and clamps confidence into [0, 1]', () => {
    expect(
      parseOpenRouterReply('{"species":"Elephant","confidence":2,"peopleOnly":false}', 'm1'),
    ).toMatchObject({ species: 'elephant', confidence: 1, peopleOnly: false, status: 'done' });
  });

  it('maps an empty species to unknown and finds JSON inside prose', () => {
    expect(parseOpenRouterReply('Sure: {"species":"","confidence":0.3}', 'm1').species).toBe(
      'unknown',
    );
    expect(
      parseOpenRouterReply('Result: {"species":"fox","confidence":0.91} done', 'm1'),
    ).toMatchObject({ species: 'fox', confidence: 0.91 });
  });

  it('sends the screenshot as a data URL and returns the verdict', async () => {
    let seenUrl = '';
    let seenBody = '';
    const classifier = new OpenRouterSpeciesClassifier({
      apiKey: 'test-key',
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"species":"deer","confidence":0.87,"peopleOnly":false}' } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    await expect(classifier.classify(frame)).resolves.toMatchObject({
      species: 'deer',
      confidence: 0.87,
    });
    expect(seenUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(seenBody).toContain('data:image/jpeg;base64,');
    expect(seenBody).toContain('openai/gpt-4o-mini');
  });

  it('builds from env and fails loudly when the key is unset', () => {
    expect(openRouterClassifierFromEnv({ OPENROUTER_API_KEY: 'k' }).modelId).toBe(
      'openai/gpt-4o-mini',
    );
    expect(() => openRouterClassifierFromEnv({})).toThrow(/OPENROUTER_API_KEY/);
  });
});
