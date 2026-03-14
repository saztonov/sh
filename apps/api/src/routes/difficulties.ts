import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '../db.js';
import { s3 } from '../s3.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { buildContentDisposition, resolveMimeType } from '../content-disposition.js';
import type { Difficulty, DifficultyComment, DifficultyAttachment, DifficultyDetail } from '@homework/shared';

const listQuerySchema = z.object({
  status: z.enum(['unresolved', 'resolved', 'all']).default('unresolved'),
  subject: z.string().optional(),
});

const createBodySchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  comment: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
});

const patchBodySchema = z.object({
  subject: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  comment: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  is_resolved: z.boolean().optional(),
});

const commentBodySchema = z.object({
  text: z.string().min(1),
});

const difficultyRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  fastify.addHook('preHandler', authMiddleware);

  // GET /difficulties — list
  fastify.get('/difficulties', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { status, subject } = parsed.data;

    let query = supabase
      .from('difficulties')
      .select('*')
      .order('created_at', { ascending: false });

    if (status === 'unresolved') {
      query = query.eq('is_resolved', false);
    } else if (status === 'resolved') {
      query = query.eq('is_resolved', true);
    }

    if (subject) {
      query = query.eq('subject', subject);
    }

    const { data, error } = await query;

    if (error) {
      request.log.error(error, 'Failed to fetch difficulties');
      return reply.code(500).send({ error: 'Failed to fetch difficulties' });
    }

    return { data: (data ?? []) as Difficulty[] };
  });

  // GET /difficulties/:id — detail with comments and attachments
  fastify.get<{ Params: { id: string } }>('/difficulties/:id', async (request, reply) => {
    const { id } = request.params;

    const { data: difficulty, error: diffError } = await supabase
      .from('difficulties')
      .select('*')
      .eq('id', id)
      .single();

    if (diffError || !difficulty) {
      return reply.code(404).send({ error: 'Difficulty not found' });
    }

    const [commentsResult, attachmentsResult] = await Promise.all([
      supabase
        .from('difficulty_comments')
        .select('*')
        .eq('difficulty_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('difficulty_attachments')
        .select('*')
        .eq('difficulty_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (commentsResult.error) {
      request.log.error(commentsResult.error, 'Failed to fetch comments');
    }
    if (attachmentsResult.error) {
      request.log.error(attachmentsResult.error, 'Failed to fetch attachments');
    }

    const detail: DifficultyDetail = {
      ...(difficulty as Difficulty),
      comments: (commentsResult.data ?? []) as DifficultyComment[],
      attachments: (attachmentsResult.data ?? []) as DifficultyAttachment[],
    };

    return { data: detail };
  });

  // POST /difficulties — create
  fastify.post('/difficulties', async (request, reply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('difficulties')
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      request.log.error(error, 'Failed to create difficulty');
      return reply.code(500).send({ error: 'Failed to create difficulty' });
    }

    return reply.code(201).send({ data: data as Difficulty });
  });

  // PATCH /difficulties/:id — update
  fastify.patch<{ Params: { id: string } }>('/difficulties/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = patchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const update: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    // Set resolved_at when marking as resolved
    if (parsed.data.is_resolved === true) {
      update.resolved_at = new Date().toISOString();
    } else if (parsed.data.is_resolved === false) {
      update.resolved_at = null;
    }

    const { data, error } = await supabase
      .from('difficulties')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update difficulty');
      return reply.code(404).send({ error: 'Difficulty not found or update failed' });
    }

    return { data: data as Difficulty };
  });

  // DELETE /difficulties/:id
  fastify.delete<{ Params: { id: string } }>('/difficulties/:id', async (request, reply) => {
    const { id } = request.params;

    // Delete related attachments from S3
    const { data: attachments } = await supabase
      .from('difficulty_attachments')
      .select('s3_key')
      .eq('difficulty_id', id);

    if (attachments && attachments.length > 0) {
      await Promise.all(
        attachments.map((a) =>
          s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: a.s3_key })).catch(() => {}),
        ),
      );
    }

    const { error } = await supabase.from('difficulties').delete().eq('id', id);

    if (error) {
      request.log.error(error, 'Failed to delete difficulty');
      return reply.code(500).send({ error: 'Failed to delete difficulty' });
    }

    return reply.code(204).send();
  });

  // POST /difficulties/:id/comments — add comment
  fastify.post<{ Params: { id: string } }>('/difficulties/:id/comments', async (request, reply) => {
    const { id } = request.params;
    const parsed = commentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('difficulty_comments')
      .insert({ difficulty_id: id, text: parsed.data.text })
      .select()
      .single();

    if (error) {
      request.log.error(error, 'Failed to add comment');
      return reply.code(500).send({ error: 'Failed to add comment' });
    }

    return reply.code(201).send({ data: data as DifficultyComment });
  });

  // DELETE /difficulties/:id/comments/:commentId
  fastify.delete<{ Params: { id: string; commentId: string } }>(
    '/difficulties/:id/comments/:commentId',
    async (request, reply) => {
      const { commentId } = request.params;

      const { error } = await supabase.from('difficulty_comments').delete().eq('id', commentId);

      if (error) {
        request.log.error(error, 'Failed to delete comment');
        return reply.code(500).send({ error: 'Failed to delete comment' });
      }

      return reply.code(204).send();
    },
  );

  // POST /difficulties/:id/attachments — upload file
  fastify.post<{ Params: { id: string } }>('/difficulties/:id/attachments', async (request, reply) => {
    const { id } = request.params;

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await file.toBuffer();
    const s3Key = `difficulties/${id}/${Date.now()}_${file.filename}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: file.mimetype,
      }),
    );

    const { data, error } = await supabase
      .from('difficulty_attachments')
      .insert({
        difficulty_id: id,
        file_name: file.filename,
        mime_type: file.mimetype,
        size: buffer.length,
        s3_key: s3Key,
      })
      .select()
      .single();

    if (error) {
      request.log.error(error, 'Failed to save attachment record');
      return reply.code(500).send({ error: 'Failed to save attachment' });
    }

    return reply.code(201).send({ data: data as DifficultyAttachment });
  });

  // DELETE /difficulties/:id/attachments/:attachmentId
  fastify.delete<{ Params: { id: string; attachmentId: string } }>(
    '/difficulties/:id/attachments/:attachmentId',
    async (request, reply) => {
      const { attachmentId } = request.params;

      const { data: attachment, error: fetchError } = await supabase
        .from('difficulty_attachments')
        .select('s3_key')
        .eq('id', attachmentId)
        .single();

      if (fetchError || !attachment) {
        return reply.code(404).send({ error: 'Attachment not found' });
      }

      // Delete from S3
      await s3
        .send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: attachment.s3_key }))
        .catch(() => {});

      const { error } = await supabase.from('difficulty_attachments').delete().eq('id', attachmentId);

      if (error) {
        request.log.error(error, 'Failed to delete attachment');
        return reply.code(500).send({ error: 'Failed to delete attachment' });
      }

      return reply.code(204).send();
    },
  );

  // GET /difficulties/:id/attachments/:attachmentId/download — download file
  fastify.get<{ Params: { id: string; attachmentId: string } }>(
    '/difficulties/:id/attachments/:attachmentId/download',
    async (request, reply) => {
      const { attachmentId } = request.params;

      const { data: attachment, error: fetchError } = await supabase
        .from('difficulty_attachments')
        .select('*')
        .eq('id', attachmentId)
        .single();

      if (fetchError || !attachment) {
        return reply.code(404).send({ error: 'Attachment not found' });
      }

      const typed = attachment as DifficultyAttachment;

      const command = new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: typed.s3_key,
      });

      const s3Response = await s3.send(command);

      reply.header('Content-Type', resolveMimeType(typed.mime_type, typed.file_name));
      reply.header(
        'Content-Disposition',
        buildContentDisposition(typed.file_name),
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
};

export default difficultyRoutes;
