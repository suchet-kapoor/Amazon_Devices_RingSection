import { z } from 'zod';

import { getCamera } from '@/lib/cameras';
import { getDb } from '@/lib/db';
import { evaluateDanger, NO_DANGER } from '@/lib/danger';
import { saveDetection } from '@/lib/history';
import { jsonError } from '@/lib/http';
import { classifyAnimal } from '@/lib/vision';

export const dynamic = 'force-dynamic';

const Body = z.object({
  /** base64 screenshot (data URL or raw base64). */
  imageBase64: z.string().min(1),
  /** The camera this frame belongs to - history and rules are per camera. */
  cameraId: z.string().uuid(),
  contentType: z.enum(['image/jpeg', 'image/png']).optional(),
  /** seconds into the video where the frame was captured (display only). */
  timeframeSeconds: z.number().min(0).optional(),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function decodeImage(
  body: z.infer<typeof Body>,
): { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png' } | null {
  let contentType: 'image/jpeg' | 'image/png' = body.contentType ?? 'image/jpeg';
  let raw = body.imageBase64.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png));base64,(.*)$/i.exec(raw);
  if (dataUrl) {
    contentType = dataUrl[1]!.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
    raw = dataUrl[2]!;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { bytes, contentType };
}

/**
 * POST one frame (snapshot or captured video frame) -> AI verdict -> danger
 * evaluation -> saved to the history, all in one round trip so the screen
 * and the database always agree.
 *
 * Statuses: 400 bad body/image, 404 unknown camera, 503 no model configured.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: 'Bad analyze request' }, { status: 400 });
    }
    const image = decodeImage(parsed.data);
    if (!image) {
      return Response.json(
        { error: 'image_required', detail: 'imageBase64 (JPEG/PNG frame) is required.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const camera = await getCamera(db, parsed.data.cameraId);
    if (!camera) {
      return Response.json(
        { error: 'camera_not_found', detail: 'Register this camera on the dashboard first.' },
        { status: 404 },
      );
    }

    const verdict = await classifyAnimal(image);
    if (!verdict) {
      return Response.json(
        {
          error: 'model_not_configured',
          detail:
            'No vision model is configured. Set OPENROUTER_API_KEY (recommended) or BEDROCK_MODEL_ID in apps/web/.env.local.',
        },
        { status: 503 },
      );
    }

    const capturedAt = new Date();
    const danger = verdict.peopleOnly
      ? NO_DANGER
      : evaluateDanger(verdict.species, camera.zoneKind, capturedAt);
    const animalScore = Math.round(verdict.confidence * 100);

    const saved = await saveDetection(db, {
      cameraId: camera.id,
      species: verdict.species,
      animalScore,
      dangerType: danger.dangerType,
      severity: danger.severity,
      dangerScore: danger.dangerScore,
      model: verdict.model,
      peopleOnly: verdict.peopleOnly,
      status: verdict.status,
      capturedAt,
    });

    return Response.json({
      camera: { id: camera.id, name: camera.name, zoneKind: camera.zoneKind },
      animal: {
        species: verdict.species,
        score: animalScore,
        model: verdict.model,
        peopleOnly: verdict.peopleOnly,
        status: verdict.status,
        reason: verdict.reason,
      },
      danger: { type: danger.dangerType, severity: danger.severity, score: danger.dangerScore },
      detectionId: saved.id,
      capturedAt: saved.capturedAt.toISOString(),
      timeframeSeconds: parsed.data.timeframeSeconds ?? 0,
      saved: true,
    });
  } catch (err) {
    return jsonError(err);
  }
}
