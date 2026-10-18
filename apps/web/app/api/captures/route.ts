import { NextResponse } from 'next/server';

import type { RingSnapshot } from '@predator-guard/ring';

import { findCaptureDevice, listCaptures, saveCapture } from '@/lib/captures';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { fetchLatestFrame } from '@/lib/frame';
import { ensureFarm } from '@/lib/farms';
import { createRingClient, describeRingError, ensureFreshAccessToken } from '@/lib/ring';

/**
 * Captures (the "see" milestone): the screenshot + timestamp + camera details
 * the product goal asks for, stored locally through `lib/captures` until the
 * deployment database arrives.
 *
 * `GET`  - newest-first list for the live page.
 * `POST` - snapshot one camera now (or at `atMs`) and store it.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const config = loadConfig();
  return NextResponse.json({ captures: await listCaptures(config.capturesDir) });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { deviceId?: unknown; atMs?: unknown; source?: unknown };
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

  const requestedAtMs =
    typeof body.atMs === 'number' && Number.isFinite(body.atMs) ? body.atMs : null;
  const source = typeof body.source === 'string' && body.source !== '' ? body.source : 'manual';

  try {
    const { accessToken } = await ensureFreshAccessToken(db, config, farm.id);
    const client = createRingClient(config);
    // With no explicit instant: "now", falling back to the newest recorded
    // event for cameras that have no live frame (see lib/frame.ts).
    let snapshot: RingSnapshot | null;
    let capturedAtMs: number;
    if (requestedAtMs === null) {
      const frame = await fetchLatestFrame(client, accessToken, ringDeviceId);
      snapshot = frame?.snapshot ?? null;
      capturedAtMs = frame?.atMs ?? Date.now();
    } else {
      snapshot = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
        atMs: requestedAtMs,
      });
      capturedAtMs = requestedAtMs;
    }
    if (!snapshot) {
      return NextResponse.json(
        { error: 'no_frame', detail: 'The camera has no frame at that instant.' },
        { status: 404 },
      );
    }
    const capture = await saveCapture(config.capturesDir, {
      bytes: snapshot.bytes,
      contentType: snapshot.contentType,
      // The instant this capture stands for: "now" (or the newest event) for
      // manual captures, the event's own start for event-driven ones.
      capturedAt: new Date(capturedAtMs),
      device,
      source,
    });
    return NextResponse.json({ capture }, { status: 201 });
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
