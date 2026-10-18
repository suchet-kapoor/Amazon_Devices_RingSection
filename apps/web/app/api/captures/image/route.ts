import { NextResponse } from 'next/server';

import { readCaptureImage } from '@/lib/captures';
import { loadConfig } from '@/lib/config';

/**
 * `GET /api/captures/image?file=images/…` - serve one stored capture.
 * Only files inside the captures directory's `images/` folder are readable
 * (`readCaptureImage` refuses traversal).
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const file = new URL(request.url).searchParams.get('file') ?? '';
  const config = loadConfig();
  const image = await readCaptureImage(config.capturesDir, file);
  if (!image) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response(new Uint8Array(image.bytes).buffer, {
    status: 200,
    headers: { 'content-type': image.contentType, 'cache-control': 'private, max-age=3600' },
  });
}
