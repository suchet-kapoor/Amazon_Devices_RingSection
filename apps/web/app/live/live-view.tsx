'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveDevice {
  ringDeviceId: string;
  name: string;
  zoneKind: string | null;
  online: boolean;
  e2ee: boolean;
}

export interface CaptureRecord {
  id: string;
  eventId: string | null;
  ringEventId: string | null;
  capturedAt: string;
  savedAt: string;
  ringDeviceId: string;
  deviceName: string;
  zoneKind: string | null;
  source: string;
  contentType: string;
  bytes: number;
  species: string | null;
  confidence: number | null;
  detectionStatus: string | null;
  severity: string | null;
}

const REFRESH_MS = 4000;
const CAPTURES_REFRESH_MS = 10_000;

export function LiveView({ devices }: { devices: LiveDevice[] }) {
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState<'' | 'capture' | 'scan'>('');
  const [message, setMessage] = useState('');
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [frameFailed, setFrameFailed] = useState(false);
  const nextRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const device = devices[deviceIndex]!;

  const loadCaptures = useCallback(async () => {
    const response = await fetch('/api/captures', { cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as { captures: CaptureRecord[] };
      setCaptures(body.captures);
    }
  }, []);

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  useEffect(() => {
    const interval = setInterval(() => void loadCaptures(), CAPTURES_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadCaptures]);

  /**
   * Chain the next refresh after the current frame has painted. One frame can
   * take longer than the interval ("now" is tried first, then the newest
   * event's frame - three Ring calls), and a fixed interval would keep
   * cancelling its own in-flight request, so the image never appeared.
   */
  const scheduleNext = useCallback(() => {
    if (nextRefresh.current !== null) clearTimeout(nextRefresh.current);
    if (!auto) return;
    nextRefresh.current = setTimeout(() => setTick((value) => value + 1), REFRESH_MS);
  }, [auto]);

  useEffect(() => {
    if (!auto) return;
    setTick((value) => value + 1);
    return () => {
      if (nextRefresh.current !== null) clearTimeout(nextRefresh.current);
    };
  }, [auto]);

  async function captureNow(): Promise<void> {
    setBusy('capture');
    setMessage('');
    try {
      const response = await fetch('/api/captures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: device.ringDeviceId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { capture?: CaptureRecord; detail?: string }
        | null;
      if (!response.ok || !body?.capture) {
        setMessage(body?.detail ?? `Capture failed (HTTP ${response.status}).`);
        return;
      }
      setMessage(
        `Saved ${body.capture.id} - ${Math.max(1, Math.round(body.capture.bytes / 1024))} KB.`,
      );
      await loadCaptures();
    } finally {
      setBusy('');
    }
  }

  async function scanEvents(): Promise<void> {
    setBusy('scan');
    setMessage('');
    try {
      const response = await fetch('/api/captures/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: device.ringDeviceId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { status?: string; capture?: CaptureRecord | null; scanned?: number; detail?: string }
        | null;
      if (!response.ok) {
        setMessage(body?.detail ?? `Scan failed (HTTP ${response.status}).`);
        return;
      }
      if (body?.capture) {
        setMessage(`Captured ${body.capture.capturedAt} (${body.capture.source}).`);
        await loadCaptures();
      } else if (body?.status === 'no_new_events') {
        setMessage(`No new events - all ${body.scanned ?? 0} on Ring are already captured.`);
      } else {
        setMessage('The newest event has no frame to capture.');
      }
    } finally {
      setBusy('');
    }
  }

  return (
    <section>
      {devices.length > 1 ? (
        <p>
          <label>
            Camera:{' '}
            <select
              value={deviceIndex}
              onChange={(event) => setDeviceIndex(Number(event.target.value))}
            >
              {devices.map((camera, index) => (
                <option key={camera.ringDeviceId} value={index}>
                  {camera.name}
                </option>
              ))}
            </select>
          </label>
        </p>
      ) : null}

      <p>
        <strong>{device.name}</strong> · {device.zoneKind ?? 'no zone'} ·{' '}
        {device.e2ee ? 'E2EE' : device.online ? 'online' : 'offline'}
      </p>

      <p>
        <img
          src={`/api/frame?deviceId=${encodeURIComponent(device.ringDeviceId)}&t=${tick}`}
          alt={`Near-live frame from ${device.name}`}
          width={640}
          onLoad={() => {
            setFrameFailed(false);
            scheduleNext();
          }}
          onError={() => {
            setFrameFailed(true);
            scheduleNext();
          }}
        />
      </p>
      {frameFailed ? (
        <p role="alert">
          Could not load a frame right now - the Ring token may have expired (paste a fresh one
          into apps/web/.env.local) or the camera has no frame at all.
        </p>
      ) : null}

      <p>
        <button type="button" onClick={() => void captureNow()} disabled={busy !== ''}>
          {busy === 'capture' ? 'Capturing…' : 'Capture now'}
        </button>{' '}
        <button type="button" onClick={() => void scanEvents()} disabled={busy !== ''}>
          {busy === 'scan' ? 'Scanning…' : 'Scan newest events'}
        </button>{' '}
        <button type="button" onClick={() => setTick((value) => value + 1)}>
          Refresh frame
        </button>{' '}
        <label>
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => setAuto(event.target.checked)}
          />{' '}
          auto-refresh {REFRESH_MS / 1000}s
        </label>
      </p>

      {message === '' ? null : <p role="status">{message}</p>}

      <h2>Captures ({captures.length})</h2>
      {captures.length === 0 ? (
        <p>Nothing captured yet - hit &quot;Capture now&quot;, or let an event come in and scan.</p>
      ) : (
        <ul>
          {captures.map((capture) => (
            <li key={capture.id}>
              <img
                src={`/api/captures/image?id=${encodeURIComponent(capture.id)}`}
                alt={`Capture from ${capture.deviceName}`}
                width={240}
              />
              <div>
                <strong>{capture.deviceName}</strong>
                {capture.zoneKind ? ` · ${capture.zoneKind}` : ''} · {capture.source}
              </div>
              <div>
                captured {new Date(capture.capturedAt).toLocaleString()} ·{' '}
                {Math.max(1, Math.round(capture.bytes / 1024))} KB
              </div>
              <div>
                Animal:{' '}
                {capture.detectionStatus === 'pending'
                  ? 'Identification pending'
                  : capture.species ?? 'Not analyzed'}
                {capture.confidence === null ? '' : ` · ${Math.round(capture.confidence * 100)}%`}
              </div>
              <div>
                Danger level: {capture.severity ?? 'Not assessed'}
                {capture.detectionStatus === 'fallback' ? ' · analysis fallback' : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
