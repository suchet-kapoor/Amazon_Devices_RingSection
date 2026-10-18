import { describe, expect, it } from 'vitest';

import { RingClient } from './client.js';

/**
 * Manual smoke test against the real Ring API - skipped unless RING_LIVE_TOKEN
 * is set. Playground tokens die after ~30 minutes (friction log row 22), so
 * nothing token-shaped is ever stored in this file. Run it with a fresh token:
 *
 *   $env:RING_LIVE_TOKEN = '<paste a fresh token>'    # PowerShell
 *   npx vitest run packages/ring/src/client.live.test.ts
 *
 * The run only reads (profile, devices, newest history page, one snapshot)
 * and asserts shapes, never values that could leak.
 */
const liveToken = process.env.RING_LIVE_TOKEN ?? '';

describe.skipIf(liveToken === '')('live Ring API smoke (needs RING_LIVE_TOKEN)', () => {
  const client = new RingClient({ clientId: 'unused', clientSecret: 'unused' });

  it('reads the profile, devices, the newest history page and one snapshot', async () => {
    const profile = await client.getUsersMe(liveToken);
    expect(profile.accountId).toContain('ava1.ring.account.');

    const devices = await client.listDevices(liveToken);
    expect(devices.length).toBeGreaterThan(0);
    const device = devices[0]!;

    const events = await client.listHistoryEvents(liveToken, device.ringDeviceId, { maxPages: 1 });
    const newest = events.length > 0 ? events[events.length - 1] : undefined;

    const snapshot = await client.fetchImageSnapshot(liveToken, device.ringDeviceId, {
      atMs: newest && newest.startMs > 0 ? newest.startMs + 1_500 : Date.now() - 60_000,
    });
    // A playground camera can legitimately have no frame at that instant; a
    // clean null is a pass, bytes must look like an image.
    if (snapshot) {
      expect(snapshot.bytes.byteLength).toBeGreaterThan(1_000);
      expect(['image/jpeg', 'image/png']).toContain(snapshot.contentType);
    }
    // Shape-only summary so a manual run is readable at a glance (no secrets).
    console.log(
      `live smoke: devices=${devices.length} events=${events.length}` +
        (snapshot
          ? ` snapshot=${snapshot.bytes.byteLength}B ${snapshot.contentType} origin=${snapshot.origin ?? '-'}`
          : ' snapshot=none'),
    );
  }, 60_000);
});
