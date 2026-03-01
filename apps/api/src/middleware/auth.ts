import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/** Supabase client used solely for token verification. */
const authClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthUser {
  id: string;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

/**
 * Fastify preHandler hook that validates a Bearer token from the
 * Authorization header via Supabase Auth and attaches the user
 * to the request object.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }

  request.user = {
    id: user.id,
    email: user.email,
  };
}
