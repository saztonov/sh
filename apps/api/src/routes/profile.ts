import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { UserProfile } from '@homework/shared';

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/auth/me', async (request, reply) => {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('id, display_name, role, created_at')
      .eq('id', request.user.id)
      .single();

    if (error || !profile) {
      // User exists in auth but has no profile — return defaults
      return {
        data: {
          id: request.user.id,
          display_name: request.user.email ?? '',
          email: request.user.email ?? '',
          role: 'user',
          created_at: new Date().toISOString(),
        } satisfies UserProfile,
      };
    }

    return {
      data: {
        id: profile.id,
        display_name: profile.display_name,
        email: request.user.email ?? '',
        role: profile.role,
        created_at: profile.created_at,
      } satisfies UserProfile,
    };
  });
};

export default profileRoutes;
