import type { RingClient, RingSnapshot } from '@predator-guard/ring';

/**
 * "The latest frame this camera can give us."
 *
 * A live timestamp is tried first; on cameras with nothing recorded at "now"
 * (the playground device is one) Ring answers 416 after the redirect and the
 * client returns `null` by design (F4 criterion 4). In that case the newest
 * Event History entry's own timestamp is retried - for the playground that is
 * the only frame that exists, and for a real camera it is the honest fallback
 * when it is the event the operator wants to look at.
 */

export interface LatestFrame {
  snapshot: RingSnapshot;
  /** The instant the frame stands for: "now", or the newest event's start. */
  atMs: number;
  /** True when "now" had no frame and the newest event's timestamp was used. */
  fromEvent: boolean;
}

/** How far into an event to look for its frame - the opening second can be dark. */
export const EVENT_FRAME_OFFSET_MS = 1500;

export async function fetchLatestFrame(
  client: RingClient,
  accessToken: string,
  ringDeviceId: string,
  options: { resolution?: { width: number; height: number } } = {},
): Promise<LatestFrame | null> {
  const now = Date.now();
  const live = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
    atMs: now,
    resolution: options.resolution,
  });
  if (live) return { snapshot: live, atMs: now, fromEvent: false };

  const events = await client.listHistoryEvents(accessToken, ringDeviceId, { maxPages: 1 });
  const newest = [...events].reverse().find((event) => event.startMs > 0);
  if (!newest) return null;

  const replay = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
    atMs: newest.startMs + EVENT_FRAME_OFFSET_MS,
    resolution: options.resolution,
  });
  if (!replay) return null;
  return { snapshot: replay, atMs: newest.startMs, fromEvent: true };
}
