import { getDb } from '@/lib/db';
import { getDetectionImageKey } from '@/lib/history';
import { signedCaptureUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * The picture of one capture.
 *
 * The browser never sees the bucket, the key or a credential: it asks for
 * the detection, and this route redirects to a presigned link that is
 * minted fresh (and expires in minutes). The database holds the object key,
 * not the link - a stored link would die with its signature.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const db = await getDb();
  const imageKey = await getDetectionImageKey(db, id);
  if (!imageKey) {
    return Response.json(
      { error: 'no_frame', detail: 'This capture has no stored frame.' },
      { status: 404 },
    );
  }
  try {
    const url = await signedCaptureUrl(imageKey);
    return Response.redirect(url, 302);
  } catch (err) {
    return Response.json(
      {
        error: 'storage_unavailable',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
