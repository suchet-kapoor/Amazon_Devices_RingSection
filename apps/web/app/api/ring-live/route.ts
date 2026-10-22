import { runLiveHook } from '@/lib/live-hook';
import { jsonError } from '@/lib/http';
import { ringLiveConfigured, ringLiveStatus, type RingApiFailure } from '@/lib/ring-live';

/**
 * /api/ring-live - the live section's status and hook endpoints.
 *
 *   GET  -> whether a token is configured; with a token, the real device list
 *   POST { deviceId, timestampMs?, cameraName? } -> run the live hook once:
 *        snapshot at the event instant, classify, S3 + history **only if an
 *        animal is in the frame**; otherwise the snapshot is reported and
 *        dropped.
 */
export const dynamic = 'force-dynamic';

interface RingErrorBody {
  error: string;
  detail?: string;
}

/**
 * One error shape for every Ring-device call downstream. 401 always means
 * "the pasted token is expired or wrong" - the section asks for a fresh one.
 */
export function ringErrorResponse(err: unknown): Response {
  const failure = err as RingApiFailure;
  if (failure && typeof failure === 'object' && typeof failure.status === 'number') {
    const body: RingErrorBody = { error: failure.code ?? 'ring_api_error', detail: failure.message };
    console.error(JSON.stringify({ stage: 'ring-live.error', code: failure.code, detail: failure.message }));
    return Response.json(body, { status: failure.status });
  }
  return jsonError(err);
}

export async function GET(): Promise<Response> {
  try {
    if (!ringLiveConfigured()) {
      return Response.json(
        {
          configured: false,
          detail:
            'Set RING_ACCESS_TOKEN in the root .env.local (an OAuth token from the Ring Dev Portal) to enable live cameras.',
        },
        { status: 200 },
      );
    }
    const status = await ringLiveStatus();
    return Response.json({ configured: true, ...status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ringErrorResponse(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as {
      deviceId?: string;
      cameraName?: string;
      timestampMs?: number;
    } | null;
    if (!body?.deviceId || body.deviceId.length > 200) {
      return Response.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
    }
    const outcome = await runLiveHook({
      deviceId: body.deviceId,
      cameraName: body.cameraName,
      timestampMs: body.timestampMs,
    });
    return Response.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ringErrorResponse(err);
  }
}
