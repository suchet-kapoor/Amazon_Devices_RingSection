'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { bestAnimal, formatTimeframe } from '@/lib/animal-filter';

/** Predictions as returned by @tensorflow-models/coco-ssd (kept structural to avoid a type-only import). */
interface CocoPrediction {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface CocoModel {
  detect(input: HTMLVideoElement): Promise<CocoPrediction[]>;
}

interface DetectorModule {
  load(): Promise<CocoModel>;
}

interface AnimalResult {
  species: string;
  confidence: number;
  peopleOnly?: boolean;
  status: string;
  reason?: string;
  model?: string;
}

interface CapturedShot {
  dataUrl: string;
  timeframeSeconds: number;
  localLabel: string;
  localScore: number | null;
  animal: AnimalResult | null | undefined; // undefined = still identifying
}

const SAMPLE_MS = 700;
const ANIMAL_THRESHOLD = 0.6;

declare global {
  interface Window {
    tf?: unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/** Lazy-load TF.js + COCO-SSD from CDN - browser only, no npm deps added. */
async function loadDetector(): Promise<CocoModel> {
  const globalWindow = window as unknown as { cocoSsd?: DetectorModule; tf?: unknown };
  if (!globalWindow.cocoSsd) {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
  }
  const cocoSsd = (window as unknown as { cocoSsd?: DetectorModule }).cocoSsd;
  if (!cocoSsd) throw new Error('COCO-SSD failed to load');
  return cocoSsd.load();
}

function verdictText(shot: CapturedShot): string {
  const where = `Screenshot at ${formatTimeframe(shot.timeframeSeconds)}`;
  if (shot.animal === undefined) return `${where} - identifying the animal...`;
  if (shot.animal === null) {
    return `${where} - animal check is off: add OPENROUTER_API_KEY in apps/web/.env.local to enable OpenRouter.`;
  }
  if (shot.animal.peopleOnly) return `${where} - people only, no animal identified (OpenRouter).`;
  if (shot.animal.status === 'fallback') {
    return `${where} - ${shot.animal.reason ?? 'Animal check failed - please look at the screenshot.'}`;
  }
  if (shot.animal.species === 'unknown') return `${where} - OpenRouter: unknown animal, please check the screenshot.`;
  return `${where} - OpenRouter: ${shot.animal.species} (about ${Math.round(shot.animal.confidence * 100)}% sure).`;
}

export function VideoView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shotRef = useRef<CapturedShot | null>(null);
  const busyRef = useRef(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [watching, setWatching] = useState(false);
  const [status, setStatus] = useState('Choose a video file to start.');
  const [shot, setShot] = useState<CapturedShot | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const captureCurrentFrame = useCallback(
    async (localLabel: string, localScore: number | null) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || busyRef.current) return;
      busyRef.current = true;
      try {
        const timeframeSeconds = video.currentTime;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        video.pause();
        setWatching(false);
        const captured: CapturedShot = {
          dataUrl,
          timeframeSeconds,
          localLabel,
          localScore,
          animal: undefined,
        };
        shotRef.current = captured;
        setShot(captured);
        setStatus('Animal spotted - screenshot captured, sending it to OpenRouter...');
        try {
          const response = await fetch('/api/video/identify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              imageBase64: dataUrl,
              contentType: 'image/jpeg',
              timeframeSeconds,
            }),
          });
          const body = (await response.json().catch(() => null)) as {
            animal?: AnimalResult | null;
            detail?: string;
          } | null;
          if (!response.ok) {
            setShot((prev) =>
              prev && prev.dataUrl === dataUrl
                ? {
                    ...prev,
                    animal: {
                      species: 'unknown',
                      confidence: 0,
                      status: 'fallback',
                      reason: body?.detail ?? `Identification failed (HTTP ${response.status}).`,
                    },
                  }
                : prev,
            );
            return;
          }
          setShot((prev) =>
            prev && prev.dataUrl === dataUrl ? { ...prev, animal: body?.animal ?? null } : prev,
          );
        } catch {
          setShot((prev) =>
            prev && prev.dataUrl === dataUrl
              ? {
                  ...prev,
                  animal: {
                    species: 'unknown',
                    confidence: 0,
                    status: 'fallback',
                    reason: 'Could not reach the server to identify the animal.',
                  },
                }
              : prev,
          );
        }
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const watch = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setWatching(true);
    setStatus('Loading the local animal detector (first time can take a few seconds)...');
    let model: CocoModel;
    try {
      model = await loadDetector();
    } catch {
      setWatching(false);
      setStatus('Could not load the animal detector. Check your connection, or use "Identify current frame" while the video plays.');
      return;
    }
    setStatus('Watching the video - the first animal frame will be captured automatically...');
    void video.play().catch(() => undefined);
    while (!video.paused && !video.ended) {
      if (shotRef.current) break;
      try {
        const predictions = await model.detect(video);
        const hit = bestAnimal(predictions, ANIMAL_THRESHOLD);
        if (hit) {
          await captureCurrentFrame(hit.label, hit.score);
          break;
        }
      } catch {
        // One bad frame must not stop watching.
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
    }
    setWatching(false);
  }, [videoUrl, captureCurrentFrame]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    shotRef.current = null;
    setShot(null);
    setVideoUrl(URL.createObjectURL(file));
    setStatus(`Loaded "${file.name}" - press play, then "Watch for animal".`);
  }

  function reset() {
    shotRef.current = null;
    setShot(null);
    setStatus('Watching again - press play, then "Watch for animal".');
  }

  return (
    <section>
      <p>
        <label>
          Video file: <input type="file" accept="video/*" onChange={onFileChange} />
        </label>
      </p>
      {videoUrl ? (
        <p>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            muted
            playsInline
            style={{ width: '100%', maxWidth: 720, display: 'block', background: '#000' }}
          />
        </p>
      ) : null}
      <p style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" onClick={() => void watch()} disabled={!videoUrl || watching}>
          {watching ? 'Watching...' : 'Watch for animal'}
        </button>
        <button
          type="button"
          onClick={() => void captureCurrentFrame('manual', null)}
          disabled={!videoUrl}
        >
          Identify current frame
        </button>
        {shot ? (
          <button type="button" onClick={reset}>
            Clear result &amp; watch again
          </button>
        ) : null}
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>
      {shot ? (
        <div>
          <h2>Captured screenshot</h2>
          <p>
            <img
              src={shot.dataUrl}
              alt="Frame captured at the moment an animal was spotted"
              style={{ width: '100%', maxWidth: 720, height: 'auto', display: 'block' }}
            />
          </p>
          <p>
            <strong>{verdictText(shot)}</strong>
          </p>
          <p style={{ fontSize: '0.9em' }}>
            Local detector: {shot.localLabel}
            {shot.localScore !== null ? ` (about ${Math.round(shot.localScore * 100)}% sure)` : ''} at{' '}
            {formatTimeframe(shot.timeframeSeconds)} ({shot.timeframeSeconds.toFixed(2)}s).
          </p>
        </div>
      ) : null}
      <p style={{ fontSize: '0.9em' }}>
        The video never leaves your browser - only the single captured screenshot is sent to the
        server for OpenRouter identification. The animal name is an estimate - always check the
        screenshot before acting.
      </p>
    </section>
  );
}
