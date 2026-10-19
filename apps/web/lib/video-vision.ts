import type { OpenRouterClassification } from '@predator-guard/vision/openrouter';
import { OpenRouterSpeciesClassifier } from '@predator-guard/vision/openrouter';

/**
 * Screenshot -> ONE OpenRouter call -> JSON verdict. Never throws.
 *
 * Shared by every frame source: the video dev page today (stand-in for a
 * Ring feed), a real Ring snapshot tomorrow - both produce one captured
 * frame at one moment, so both land here.
 */
export interface ScreenshotVerdict extends OpenRouterClassification {
  capturedAt: string;
  reason?: string;
}

export function openRouterClassifierFromProcessEnv(): OpenRouterSpeciesClassifier | null {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return null;
    return new OpenRouterSpeciesClassifier({
      apiKey,
      model: process.env.OPENROUTER_VISION_MODEL?.trim() || undefined,
      baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || undefined,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        stage: 'video-vision.config_invalid',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

export async function identifyScreenshotAnimal(input: {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  capturedAt: Date;
  classifier?: OpenRouterSpeciesClassifier | null;
}): Promise<ScreenshotVerdict | null> {
  let classifier: OpenRouterSpeciesClassifier | null;
  try {
    classifier =
      input.classifier === undefined
        ? openRouterClassifierFromProcessEnv()
        : input.classifier;
  } catch {
    classifier = null;
  }
  if (!classifier) return null;
  try {
    const result = await classifier.classify({
      bytes: input.bytes,
      contentType: input.contentType,
    });
    console.info(
      JSON.stringify({
        stage: 'video-vision.done',
        model: result.model,
        species: result.species,
        confidence: result.confidence,
        peopleOnly: result.peopleOnly,
      }),
    );
    return { ...result, capturedAt: input.capturedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({ stage: 'video-vision.fallback', model: classifier.modelId, error: message }),
    );
    return {
      species: 'unknown',
      confidence: 0,
      model: classifier.modelId,
      peopleOnly: false,
      status: 'fallback',
      reason: 'Animal check failed - screenshot captured, please check it manually.',
      capturedAt: input.capturedAt.toISOString(),
    };
  }
}
