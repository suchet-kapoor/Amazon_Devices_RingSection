import { NextResponse } from 'next/server';

import { identifyScreenshotAnimal } from '@/lib/video-vision';

export const dynamic = 'force-dynamic';

export interface VideoIdentifyRequest {
  /** base64 screenshot (data URL or raw base64). */
  imageBase64: string;
  contentType?: 'image/jpeg' | 'image/png';
  /** seconds into the video where the screenshot was captured. */
  timeframeSeconds: number;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function decodeImage(body: Partial<VideoIdentifyRequest>): {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
} | null {
  if (typeof body.imageBase64 !== 'string' || body.imageBase64 === '') return null;
  let contentType: 'image/jpeg' | 'image/png' = body.contentType === 'image/png' ? 'image/png' : 'image/jpeg';
  let raw = body.imageBase64.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png));base64,(.*)$/i.exec(raw);
  if (dataUrl) {
    contentType = dataUrl[1]!.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
    raw = dataUrl[2]!;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { bytes, contentType };
}

/**
 * POST one captured screenshot -> OpenRouter animal verdict.
 * No key in .env.local => { animal: null } and nothing is called.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Partial<VideoIdentifyRequest>;
  try {
    body = (await request.json()) as Partial<VideoIdentifyRequest>;
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'Expected a JSON body.' },
      { status: 400 },
    );
  }

  const image = decodeImage(body);
  if (!image) {
    return NextResponse.json(
      { error: 'image_required', detail: 'imageBase64 (JPEG/PNG screenshot) is required.' },
      { status: 400 },
    );
  }
  const timeframeSeconds =
    typeof body.timeframeSeconds === 'number' && Number.isFinite(body.timeframeSeconds) && body.timeframeSeconds >= 0
      ? body.timeframeSeconds
      : 0;

  const animal = await identifyScreenshotAnimal({
    bytes: image.bytes,
    contentType: image.contentType,
    capturedAt: new Date(),
  });
  return NextResponse.json({ timeframeSeconds, animal });
}
