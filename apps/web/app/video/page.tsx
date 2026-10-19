import Link from 'next/link';

import { VideoView } from './video-view';

export const dynamic = 'force-dynamic';

export default function VideoPage() {
  return (
    <main className="stack">
      <header className="stack">
        <h1>Camera check</h1>
        <p>
          No Ring device API needed: load one of your own videos or a snapshot, pick the camera it
          belongs to, and the frame is sent to the AI model. The answer lands on screen -{' '}
          <strong>Animal Score</strong> and <strong>Danger Type</strong> - and is saved to the
          Postgres history for that camera in parallel.
        </p>
      </header>
      <VideoView />
      <p>
        <Link href="/">Dashboard &amp; history</Link>
      </p>
    </main>
  );
}
