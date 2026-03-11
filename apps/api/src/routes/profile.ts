import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { BANNED_PASSWORDS } from '@homework/shared';
import type { UserProfile } from '@homework/shared';

const changeMyPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Минимум 8 символов')
    .refine((v) => !BANNED_PASSWORDS.includes(v.toLowerCase()), {
      message: 'Слишком простой пароль',
    }),
});

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
          role: request.user.role,
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

  // PATCH /auth/me/password — change own password
  fastify.patch('/auth/me/password', async (request, reply) => {
    const parsed = changeMyPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ошибка валидации', details: parsed.error.flatten() });
    }

    const { error } = await supabase.auth.admin.updateUserById(request.user.id, {
      password: parsed.data.password,
    });

    if (error) {
      request.log.error(error, 'Failed to change own password');
      return reply.code(500).send({ error: 'Не удалось изменить пароль' });
    }

    return { success: true };
  });
};

export default profileRoutes;
