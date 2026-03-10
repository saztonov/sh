import type { FastifyPluginAsync } from 'fastify';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '../db.js';
import { s3 } from '../s3.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Attachment } from '@homework/shared';

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /files/:attachmentId/download - stream file from S3 through API
   * Avoids presigned URL issues with Cloud.ru by proxying the download.
   */
  fastify.get<{ Params: { attachmentId: string } }>(
    '/files/:attachmentId/download',
    async (request, reply) => {
      const { attachmentId } = request.params;

      const { data: attachment, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('id', attachmentId)
        .single();

      if (error || !attachment) {
        return reply.code(404).send({ error: 'Attachment not found' });
      }

      const typed = attachment as Attachment;

      const command = new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: typed.s3_key,
      });

      const s3Response = await s3.send(command);

      reply.header(
        'Content-Type',
        typed.mime_type || 'application/octet-stream',
      );
      reply.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(typed.original_name)}`,
      );
      if (s3Response.ContentLength) {
        reply.header('Content-Length', String(s3Response.ContentLength));
      }

      const bodyBytes = await s3Response.Body?.transformToByteArray();
      if (!bodyBytes) {
        return reply.code(500).send({ error: 'Empty response from storage' });
      }
      return reply.send(Buffer.from(bodyBytes));
    },
  );

  /**
   * GET /files/debug/:key - proxy debug files (screenshots etc.) from S3.
   * Key is the S3 object key under debug/ prefix.
   */
  fastify.get<{ Params: { '*': string } }>(
    '/files/debug/*',
    async (request, reply) => {
      const key = request.params['*'];

      // Only allow files under debug/ prefix for security
      const s3Key = `debug/${key}`;

      try {
        const command = new GetObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: s3Key,
        });

        const s3Response = await s3.send(command);

        reply.header('Content-Type', s3Response.ContentType || 'image/png');
        if (s3Response.ContentLength) {
          reply.header('Content-Length', String(s3Response.ContentLength));
        }
        reply.header('Cache-Control', 'public, max-age=86400');

        const bodyBytes = await s3Response.Body?.transformToByteArray();
        if (!bodyBytes) {
          return reply.code(500).send({ error: 'Empty response from storage' });
        }
        return reply.send(Buffer.from(bodyBytes));
      } catch {
        return reply.code(404).send({ error: 'Debug file not found' });
      }
    },
  );

  /**
   * GET /files/:attachmentId - JSON metadata (backwards compat)
   */
  fastify.get<{ Params: { attachmentId: string } }>(
    '/files/:attachmentId',
    async (request, reply) => {
      const { attachmentId } = request.params;

      const { data: attachment, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('id', attachmentId)
        .single();

      if (error || !attachment) {
        return reply.code(404).send({ error: 'Attachment not found' });
      }

      const typed = attachment as Attachment;

      return {
        originalName: typed.original_name,
        mimeType: typed.mime_type,
        sizeBytes: typed.size_bytes,
      };
    },
  );
};

export default fileRoutes;
