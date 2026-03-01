import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db.js';
import { getPresignedUrl } from '../s3.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Attachment } from '@homework/shared';

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /files/:attachmentId - get a presigned download URL for an attachment
   */
  fastify.get<{ Params: { attachmentId: string } }>('/files/:attachmentId', async (request, reply) => {
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

    const url = await getPresignedUrl(typed.s3_key);

    return {
      url,
      originalName: typed.original_name,
      mimeType: typed.mime_type,
    };
  });

  /**
   * GET /files/:attachmentId/preview - presigned URL with inline content-disposition hint
   */
  fastify.get<{ Params: { attachmentId: string } }>('/files/:attachmentId/preview', async (request, reply) => {
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

    const url = await getPresignedUrl(typed.s3_key);

    return {
      url,
      originalName: typed.original_name,
      mimeType: typed.mime_type,
      contentDisposition: 'inline',
    };
  });
};

export default fileRoutes;
