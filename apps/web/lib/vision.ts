import { detections } from '@predator-guard/db';
import type { Db } from '@predator-guard/db';
import type { Classification } from '@predator-guard/vision';
import { OpenCodeSpeciesClassifier } from '@predator-guard/vision/opencode';

/**
 * What type of animal is it? Photo (from Ring video/event) -> ONE OpenCode
 * call with OPENCODE_API_KEY from .env.local -> JSON verdict for the owner.
 * Restricted: only at capture time, never on live-frame refresh; exactly
 * one request per capture, no retries; no key => no call; provider error
 * => fail open to unknown, capture never lost.
 */
export interface AnimalVerdict extends Classification {
  capturedAt: string;
}

const FALLBACK_MODEL = 'opencode';

export function openCodeClassifierFromProcessEnv(): OpenCodeSpeciesClassifier | null {
  const apiKey = process.env.OPENCODE_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenCodeSpeciesClassifier({
    apiKey,
    model: process.env.OPENCODE_VISION_MODEL?.trim() || undefined,
    baseUrl: process.env.OPENCODE_BASE_URL?.trim() || undefined,
  });
}

export async function identifyAnimal(input: {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  capturedAt: Date;
  eventId?: string;
  classifier?: OpenCodeSpeciesClassifier | null;
}): Promise<AnimalVerdict | null> {
  const classifier =
    input.classifier === undefined ? openCodeClassifierFromProcessEnv() : input.classifier;
  if (!classifier) return null;
  try {
    const result = await classifier.classify({
      bytes: input.bytes,
      contentType: input.contentType,
      eventId: input.eventId,
    });
    return { ...result, capturedAt: input.capturedAt.toISOString() };
  } catch (error) {
    console.warn(
      JSON.stringify({
        stage: 'vision.fallback',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return {
      species: 'unknown',
      confidence: 0,
      model: classifier.modelId || FALLBACK_MODEL,
      peopleOnly: false,
      status: 'fallback',
      capturedAt: input.capturedAt.toISOString(),
    };
  }
}

/** Persist verdict so /live shows species+confidence to the owner. */
export async function saveAnimalVerdict(
  db: Db,
  eventId: string,
  captureId: string,
  verdict: AnimalVerdict,
): Promise<void> {
  await db
    .insert(detections)
    .values({
      eventId,
      species: verdict.species,
      confidence: verdict.confidence,
      model: verdict.model,
      frameUrl: `/api/captures/image?id=${encodeURIComponent(captureId)}`,
      status: verdict.status,
    })
    .onConflictDoUpdate({
      target: detections.eventId,
      set: {
        species: verdict.species,
        confidence: verdict.confidence,
        model: verdict.model,
        frameUrl: `/api/captures/image?id=${encodeURIComponent(captureId)}`,
        status: verdict.status,
      },
    });
}
