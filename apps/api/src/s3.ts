import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

export const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  credentials: {
    accessKeyId: `${config.S3_TENANT_ID}:${config.S3_ACCESS_KEY}`,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Generate a presigned GET URL for an S3 object.
 * @param key   - The S3 object key
 * @param expiresIn - URL validity in seconds (default 3600 = 1 hour)
 */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}
