import { and, eq } from 'drizzle-orm';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { devices, zones, type Db } from '@predator-guard/db';

/**
 * Capture storage (the "see" milestone).
 *
 * The product goal: live view -> something crosses the frame -> keep the
 * screenshot, its timestamp and the camera details. Until the deployment
 * database arrives (the operator's Postgres/MSSQL credentials), captures live
 * on disk as a JPEG/PNG plus one JSON line in `index.jsonl` - swappable for
 * rows later because every writer goes through `saveCapture`.
 */

export interface CaptureDevice {
  ringDeviceId: string;
  name: string;
  zoneKind: string | null;
}

export interface CaptureRecord {
  id: string;
  /** When the frame was asked for: event time for event captures, "now" for manual ones. */
  capturedAt: string;
  savedAt: string;
  ringDeviceId: string;
  deviceName: string;
  zoneKind: string | null;
  /** `manual` or `event:<history-event-id>` - also the event dedupe key. */
  source: string;
  contentType: string;
  bytes: number;
  /** Path relative to the captures directory, e.g. `images/2026-…-abc123.jpg`. */
  file: string;
}

export interface SaveCaptureInput {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  capturedAt: Date;
  device: CaptureDevice;
  source: string;
}

const IMAGE_DIR = 'images';
const INDEX_FILE = 'index.jsonl';

/** A filesystem-safe, sortable id; collisions are broken by the random tail. */
function captureId(capturedAt: Date): string {
  const stamp = capturedAt.toISOString().replace(/[:.]/g, '-');
  const tail = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${tail}`;
}

/** Look a camera up with its zone, so a capture can carry the camera details. */
export async function findCaptureDevice(
  db: Db,
  farmId: string,
  ringDeviceId: string,
): Promise<CaptureDevice | null> {
  const rows = await db
    .select({
      ringDeviceId: devices.ringDeviceId,
      name: devices.name,
      zoneKind: zones.kind,
    })
    .from(devices)
    .leftJoin(zones, eq(devices.zoneId, zones.id))
    .where(and(eq(devices.farmId, farmId), eq(devices.ringDeviceId, ringDeviceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ringDeviceId: row.ringDeviceId, name: row.name, zoneKind: row.zoneKind ?? null };
}

/** Store one frame + its metadata record. Returns exactly what was written. */
export async function saveCapture(dir: string, input: SaveCaptureInput): Promise<CaptureRecord> {
  const id = captureId(input.capturedAt);
  const extension = input.contentType === 'image/png' ? 'png' : 'jpg';
  const file = `${IMAGE_DIR}/${id}.${extension}`;
  const record: CaptureRecord = {
    id,
    capturedAt: input.capturedAt.toISOString(),
    savedAt: new Date().toISOString(),
    ringDeviceId: input.device.ringDeviceId,
    deviceName: input.device.name,
    zoneKind: input.device.zoneKind,
    source: input.source,
    contentType: input.contentType,
    bytes: input.bytes.byteLength,
    file,
  };

  await mkdir(path.join(dir, IMAGE_DIR), { recursive: true });
  await writeFile(path.join(dir, file), input.bytes);
  await appendFile(path.join(dir, INDEX_FILE), `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/** Newest first. A missing index (nothing captured yet) is simply empty. */
export async function listCaptures(dir: string, limit = 100): Promise<CaptureRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, INDEX_FILE), 'utf8');
  } catch {
    return [];
  }
  const records: CaptureRecord[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as CaptureRecord);
    } catch {
      // A torn final line (crash mid-append) is skipped, never fatal.
    }
  }
  return records.reverse().slice(0, limit);
}

/** Read one stored image. Only files inside `images/` are servable. */
export async function readCaptureImage(
  dir: string,
  file: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const normalised = file.replace(/\\/g, '/');
  if (!normalised.startsWith(`${IMAGE_DIR}/`) || normalised.includes('..')) return null;
  try {
    const stored = await readFile(path.join(dir, normalised));
    return {
      bytes: new Uint8Array(stored),
      contentType: normalised.endsWith('.png') ? 'image/png' : 'image/jpeg',
    };
  } catch {
    return null;
  }
}
