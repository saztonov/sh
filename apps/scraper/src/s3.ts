import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { config } from './config.js';
import { logger } from './logger.js';

const s3Config: S3ClientConfig = {
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: true,
};

export const s3Client = new S3Client(s3Config);

export interface UploadResult {
  s3Key: string;
  s3Url: string;
}

/**
 * Upload a buffer to S3 using multipart upload.
 * Returns the S3 key and the public URL.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | ReadableStream | Uint8Array,
  contentType?: string,
): Promise<UploadResult> {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024, // 5 MB
  });

  await upload.done();

  const s3Url = config.s3.publicUrl
    ? `${config.s3.publicUrl}/${key}`
    : `${config.s3.endpoint}/${config.s3.bucket}/${key}`;

  logger.info({ key }, 'Uploaded file to S3');

  return { s3Key: key, s3Url };
}
