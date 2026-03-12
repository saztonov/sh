import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

function buildS3Client(): S3Client | null {
  const { endpoint, region, tenantId, accessKey, secretKey } = config.s3;
  if (!endpoint || !region || !tenantId || !accessKey || !secretKey) {
    return null;
  }
  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: `${tenantId}:${accessKey}`,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true,
  });
}

const s3 = buildS3Client();

/**
 * Generate a presigned GET URL for an S3 object (1 hour validity).
 * Returns null if S3 is not configured.
 */
export async function getPresignedUrl(
  key: string,
  originalName?: string,
): Promise<string | null> {
  if (!s3 || !config.s3.bucket) return null;

  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ...(originalName && {
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    }),
  });

  return getSignedUrl(s3, command, { expiresIn: 3600 });
}
