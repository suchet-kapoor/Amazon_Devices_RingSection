import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listCaptures, readCaptureImage, saveCapture } from './captures';

/**
 * Capture storage (the "see" milestone): bytes land on disk, metadata lands in
 * `index.jsonl`, and only files inside `images/` are ever servable.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const DEVICE = { ringDeviceId: 'ava1.ring.device.A', name: 'Coop cam', zoneKind: 'coop' };

describe('capture storage', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pg-captures-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores the frame and a metadata record, newest first', async () => {
    const first = await saveCapture(dir, {
      bytes: JPEG,
      contentType: 'image/jpeg',
      capturedAt: new Date('2026-10-19T02:00:00.000Z'),
      device: DEVICE,
      source: 'manual',
    });
    const second = await saveCapture(dir, {
      bytes: JPEG,
      contentType: 'image/jpeg',
      capturedAt: new Date('2026-10-19T03:00:00.000Z'),
      device: DEVICE,
      source: 'event:evt-1',
    });

    const onDisk = await readFile(path.join(dir, first.file));
    expect([...onDisk]).toEqual([...JPEG]);

    const captures = await listCaptures(dir);
    expect(captures.map((record) => record.id)).toEqual([second.id, first.id]);
    expect(captures[1]).toMatchObject({
      deviceName: 'Coop cam',
      zoneKind: 'coop',
      capturedAt: '2026-10-19T02:00:00.000Z',
      bytes: JPEG.byteLength,
      source: 'manual',
    });
  });

  it('is empty before anything is captured', async () => {
    await expect(listCaptures(dir)).resolves.toEqual([]);
  });

  it('serves only files inside images/ and refuses traversal', async () => {
    const record = await saveCapture(dir, {
      bytes: JPEG,
      contentType: 'image/jpeg',
      capturedAt: new Date('2026-10-19T02:00:00.000Z'),
      device: DEVICE,
      source: 'manual',
    });

    const image = await readCaptureImage(dir, record.file);
    expect(image?.contentType).toBe('image/jpeg');
    expect([...(image?.bytes ?? [])]).toEqual([...JPEG]);

    await expect(readCaptureImage(dir, '../index.jsonl')).resolves.toBeNull();
    await expect(readCaptureImage(dir, 'index.jsonl')).resolves.toBeNull();
    await expect(readCaptureImage(dir, 'images/../index.jsonl')).resolves.toBeNull();
    await expect(readCaptureImage(dir, 'images/missing.jpg')).resolves.toBeNull();
  });
});
