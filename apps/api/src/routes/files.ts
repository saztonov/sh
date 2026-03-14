import type { FastifyPluginAsync } from 'fastify';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '../db.js';
import { s3 } from '../s3.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { buildContentDisposition, resolveMimeType } from '../content-disposition.js';
import type { Attachment } from '@homework/shared';

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /files/debug/* - proxy debug files (screenshots etc.) from S3.
   * No auth required — keys contain timestamps and are hard to guess.
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
   * Shared handler for file download — proxies from S3, sets proper headers.
   */
  async function handleFileDownload(attachmentId: string, reply: any) {
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

    reply.header('Content-Type', resolveMimeType(typed.mime_type, typed.original_name));
    reply.header('Content-Disposition', buildContentDisposition(typed.original_name));
    if (s3Response.ContentLength) {
      reply.header('Content-Length', String(s3Response.ContentLength));
    }

    const bodyBytes = await s3Response.Body?.transformToByteArray();
    if (!bodyBytes) {
      return reply.code(500).send({ error: 'Empty response from storage' });
    }
    return reply.send(Buffer.from(bodyBytes));
  }

  /**
   * GET /files/:attachmentId/download/:fileName - proxy file from S3.
   * The :fileName segment is cosmetic (for Android download manager)
   * but the actual name comes from DB via Content-Disposition header.
   */
  fastify.get<{ Params: { attachmentId: string; fileName: string } }>(
    '/files/:attachmentId/download/:fileName',
    async (request, reply) => handleFileDownload(request.params.attachmentId, reply),
  );

  /**
   * GET /files/:attachmentId/download - legacy route (backwards compat).
   */
  fastify.get<{ Params: { attachmentId: string } }>(
    '/files/:attachmentId/download',
    async (request, reply) => handleFileDownload(request.params.attachmentId, reply),
  );

  // Authenticated routes in a separate encapsulation context
  await fastify.register(async (authScope) => {
    authScope.addHook('preHandler', authMiddleware);

    /**
     * GET /files/:attachmentId - JSON metadata (backwards compat)
     */
    authScope.get<{ Params: { attachmentId: string } }>(
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
  });
};

export default fileRoutes;
