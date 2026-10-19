import Link from 'next/link';

import { listCameras } from '@/lib/cameras';
import { getDb } from '@/lib/db';
import { listRecentDetections, speciesSummaryByCamera } from '@/lib/history';
import { zoneLabel } from '@/lib/zones';

import { CameraManager, type CameraItem } from './camera-manager';

/**
 * Predator Guard dashboard.
 *
 * The demo loop: feed a frame on /video, see the Animal Score and Danger
 * Type on screen, and find the same result here afterwards - saved to the
 * Postgres history, grouped per camera.
 */

export const dynamic = 'force-dynamic';

const BADGE_KINDS = ['critical', 'danger', 'warning', 'monitor', 'none'];

function badgeClass(dangerType: string): string {
  const slug = dangerType.toLowerCase();
  return BADGE_KINDS.includes(slug) ? `badge badge-${slug}` : 'badge';
}

interface CameraSummary {
  camera: CameraItem;
  species: Array<{ species: string; count: number; worstDangerScore: number }>;
}

export default async function HomePage() {
  const db = await getDb();
  const cameras = await listCameras(db);
  const recent = await listRecentDetections(db, 12);
  const summary = await speciesSummaryByCamera(db);

  const summaries: CameraSummary[] = cameras.map((camera) => ({
    camera: { id: camera.id, name: camera.name, zoneKind: camera.zoneKind },
    species: summary
      .filter((row) => row.cameraId === camera.id)
      .map((row) => ({
        species: row.species,
        count: row.count,
        worstDangerScore: row.worstDangerScore,
      })),
  }));

  return (
    <main className="stack">
      <header className="stack">
        <h1>Predator Guard</h1>
        <p>
          Point the AI model at a frame - from your own video or a snapshot - and it names the
          animal, scores how sure it is, and grades the danger for the zone that camera watches.
          Every result appears below and is saved to the Postgres history in parallel.
        </p>
        <p>
          <Link href="/video">Open the camera check →</Link>
        </p>
      </header>

      <section className="stack">
        <h2>Cameras</h2>
        <CameraManager cameras={summaries.map((entry) => entry.camera)} />
      </section>

      <section className="stack">
        <h2>Animal types by camera</h2>
        {cameras.length === 0 ? (
          <p className="muted">No cameras yet - add your first camera above.</p>
        ) : (
          <div className="camera-grid">
            {summaries.map(({ camera, species }) => (
              <div key={camera.id} className="card">
                <p>
                  <strong>{camera.name}</strong>{' '}
                  <span className="muted">{zoneLabel(camera.zoneKind)}</span>
                </p>
                {species.length === 0 ? (
                  <p className="muted">No animals identified yet.</p>
                ) : (
                  <ul className="chip-list">
                    {species.map((row) => (
                      <li key={row.species}>
                        {row.species} ×{row.count} · worst danger {row.worstDangerScore}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Danger feed</h2>
        {recent.length === 0 ? (
          <p className="muted">
            No analyses yet. Feed a frame on the <Link href="/video">camera check</Link>.
          </p>
        ) : (
          <ul className="feed">
            {recent.map((row) => (
              <li key={row.id}>
                <span className={badgeClass(row.dangerType)}>{row.dangerType}</span>
                <strong>{row.animalScore}%</strong>
                <span>{row.species}</span>
                <span className="muted">{row.cameraName}</span>
                <time className="muted" dateTime={row.capturedAt}>
                  {new Date(row.capturedAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
