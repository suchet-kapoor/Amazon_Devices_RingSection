import { NextResponse } from 'next/server';

import { findCaptureDevice, listCaptures, saveCapture } from '@/lib/captures';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { EVENT_FRAME_OFFSET_MS } from '@/lib/frame';
import { ensureFarm } from '@/lib/farms';
import { createRingClient, describeRingError, ensureFreshAccessToken } from '@/lib/ring';

/**
 * `POST /api/captures/scan` - the "something crossed the frame" step.
 *
 * Pulls the newest Event History page, takes the newest event we have not
 * captured yet, snapshots the camera *at that event's own timestamp* and
 * stores it with the event id as the dedupe key (`source: event:<id>`).
 * The playground only emits `on_demand` events; real accounts add motion,
 * and Smart Alerts add `sub_type` values like `motion.animal`.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { deviceId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'Expected a JSON body.' },
      { status: 400 },
    );
  }

  const ringDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
  if (ringDeviceId === '') {
    return NextResponse.json(
      { error: 'device_required', detail: 'deviceId is required.' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }

  const device = await findCaptureDevice(db, farm.id, ringDeviceId);
  if (!device) {
    return NextResponse.json(
      { error: 'unknown_device', detail: 'This camera is not stored yet - run a sync first.' },
      { status: 404 },
    );
  }

  try {
    const { accessToken } = await ensureFreshAccessToken(db, config, farm.id);
    const client = createRingClient(config);
    const known = new Set(
      (await listCaptures(config.capturesDir, 500)).map((record) => record.source),
    );
    const events = await client.listHistoryEvents(accessToken, ringDeviceId, { maxPages: 1 });
    const fresh = events.filter(
      (event) => event.startMs > 0 && !known.has(`event:${event.eventId}`),
    );
    if (fresh.length === 0) {
      return NextResponse.json({ status: 'no_new_events', scanned: events.length, capture: null });
    }

    const newest = fresh[fresh.length - 1]!;
    const snapshot = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
      atMs: newest.startMs + EVENT_FRAME_OFFSET_MS,
    });
    if (!snapshot) {
      return NextResponse.json({ status: 'no_frame', scanned: events.length, capture: null });
    }

    const capture = await saveCapture(config.capturesDir, {
      bytes: snapshot.bytes,
      contentType: snapshot.contentType,
      capturedAt: new Date(newest.startMs),
      device,
      source: `event:${newest.eventId}`,
    });
    return NextResponse.json({
      status: 'captured',
      scanned: events.length,
      event: {
        id: newest.eventId,
        type: newest.eventType,
        subType: newest.subType,
        startMs: newest.startMs,
      },
      capture,
    });
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
