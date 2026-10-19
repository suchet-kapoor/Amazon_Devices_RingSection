import Link from 'next/link';

import { VideoView } from './video-view';

export const dynamic = 'force-dynamic';

export default function VideoPage() {
  return (
    <main>
      <h1>Video animal check (development)</h1>
      <p>
        Development stand-in for a Ring feed: until real Ring API access lands, a plain video file
        plays the role of the camera. As soon as an animal is spotted, the exact frame is captured
        as a screenshot, sent to OpenRouter, and the verdict is shown on screen. The same
        screenshot endpoint can accept a real Ring snapshot later without changes.
      </p>
      <VideoView />
      <p>
        <Link href="/">Dashboard</Link> · <Link href="/live">Live watch &amp; captures</Link> ·{' '}
        <Link href="/devices">Cameras &amp; zones</Link>
      </p>
    </main>
  );
}
