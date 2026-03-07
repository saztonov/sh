import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { supabase } from '../db.js';
import type { UserRole } from '@homework/shared';

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
  role: UserRole;
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

  // Fetch role from user_profiles (service client bypasses RLS)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return reply.code(403).send({ error: 'User profile not found' });
  }

  request.user = {
    id: user.id,
    email: user.email,
    role: profile.role as UserRole,
  };
}
