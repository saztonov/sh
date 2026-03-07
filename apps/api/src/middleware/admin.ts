import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Fastify preHandler hook that checks the current user has the 'admin' role.
 * Must be used AFTER authMiddleware.
 */
export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user?.role !== 'admin') {
    return reply.code(403).send({ error: 'Доступ запрещён' });
  }
}
