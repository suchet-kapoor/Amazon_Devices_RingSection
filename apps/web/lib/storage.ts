import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Object storage for the captured frames.
 *
 * Every analysed frame is kept in the S3-compatible bucket ("assets" on the
 * configured endpoint); the database only holds the object key. The bucket
 * stays private: reads go through a short-lived presigned URL that
 * `apps/web/app/api/captures/[id]/route.ts` hands to the browser.
 *
 * Without credentials the app still works - frames are analysed and saved,
 * they are just not kept as pictures, and the dashboard says so.
 */

/** How long a presigned read link stays valid. */
const READ_URL_TTL_SECONDS = 300;

export interface StorageSettings {
  /** Custom endpoint (S3-compatible provider). Undefined = real AWS S3. */
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  /** Path-style addressing (`host/bucket/key`), the safe default for a custom endpoint. */
  forcePathStyle: boolean;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/** The storage settings, read from the environment. */
export function storageSettings(env: NodeJS.ProcessEnv = process.env): StorageSettings {
  return {
    endpoint: readEnv(env, 'AWS_ENDPOINT_URL_S3') ?? readEnv(env, 'AWS_ENDPOINT_URL'),
    region: readEnv(env, 'AWS_REGION') ?? 'us-east-1',
    bucket: readEnv(env, 'AWS_S3_BUCKET') ?? 'assets',
    accessKeyId: readEnv(env, 'AWS_ACCESS_KEY_ID'),
    secretAccessKey: readEnv(env, 'AWS_SECRET_ACCESS_KEY'),
    forcePathStyle: readEnv(env, 'AWS_S3_FORCE_PATH_STYLE') !== 'false',
  };
}

/** True when there are enough credentials to talk to the bucket. */
export function storageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const settings = storageSettings(env);
  return Boolean(settings.accessKeyId && settings.secretAccessKey);
}

let cached: { fingerprint: string; client: S3Client } | null = null;

/** One client per configuration; the SDK handles the connection pooling. */
function s3Client(settings: StorageSettings): S3Client {
  const fingerprint = [
    settings.endpoint,
    settings.region,
    settings.accessKeyId,
    settings.secretAccessKey,
    settings.forcePathStyle,
  ].join('|');
  if (cached && cached.fingerprint === fingerprint) return cached.client;
  const client = new S3Client({
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    // The default integrity headers (`x-amz-checksum-crc32` on the upload,
    // `x-amz-checksum-mode` on the download) are an AWS S3 feature; other
    // S3-compatible servers reject them. The bucket is a plain object
    // store, so the checksums are left to the server.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    ...(settings.accessKeyId && settings.secretAccessKey
      ? {
          credentials: {
            accessKeyId: settings.accessKeyId,
            secretAccessKey: settings.secretAccessKey,
          },
        }
      : {}),
  });
  cached = { fingerprint, client };
  return client;
}

/** The object key of one capture, derived from the detection it belongs to. */
export function captureKey(detectionId: string, contentType: string): string {
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  return `captures/${detectionId}.${extension}`;
}

/** Put one captured frame into the bucket. */
export async function putCapture(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const settings = storageSettings();
  await s3Client(settings).send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** A short-lived link that reads one object back. */
export async function signedCaptureUrl(
  key: string,
  expiresInSeconds: number = READ_URL_TTL_SECONDS,
): Promise<string> {
  const settings = storageSettings();
  return getSignedUrl(
    s3Client(settings),
    new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
