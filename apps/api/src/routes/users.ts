import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { BANNED_PASSWORDS } from '@homework/shared';
import type { UserProfile } from '@homework/shared';

const createUserSchema = z.object({
  display_name: z.string().min(1, 'Имя обязательно'),
  email: z.string().email('Некорректный email'),
  password: z
    .string()
    .min(8, 'Минимум 8 символов')
    .refine((v) => !BANNED_PASSWORDS.includes(v.toLowerCase()), {
      message: 'Слишком простой пароль',
    }),
  role: z.enum(['user', 'admin']).default('user'),
});

const updateUserSchema = z.object({
  display_name: z.string().min(1).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', adminMiddleware);

  // GET /users — list all users
  fastify.get('/users', async (request, reply) => {
    // Get profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (profilesError) {
      request.log.error(profilesError, 'Failed to fetch user profiles');
      return reply.code(500).send({ error: 'Failed to fetch users' });
    }

    // Get emails from Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authError) {
      request.log.error(authError, 'Failed to fetch auth users');
      return reply.code(500).send({ error: 'Failed to fetch users' });
    }

    const emailMap = new Map<string, string>();
    for (const u of authData.users) {
      if (u.email) emailMap.set(u.id, u.email);
    }

    const users: UserProfile[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      display_name: p.display_name,
      email: emailMap.get(p.id) ?? '',
      role: p.role,
      created_at: p.created_at,
    }));

    return { data: users };
  });

  // POST /users — create user
  fastify.post('/users', async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ошибка валидации', details: parsed.error.flatten() });
    }

    const { display_name, email, password, role } = parsed.data;

    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      request.log.error(authError, 'Failed to create auth user');
      const msg = authError.message.includes('already been registered')
        ? 'Пользователь с таким email уже существует'
        : 'Не удалось создать пользователя';
      return reply.code(400).send({ error: msg });
    }

    // Create profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        display_name,
        role,
      })
      .select('*')
      .single();

    if (profileError) {
      request.log.error(profileError, 'Failed to create user profile');
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return reply.code(500).send({ error: 'Не удалось создать профиль' });
    }

    const result: UserProfile = {
      id: profile.id,
      display_name: profile.display_name,
      email,
      role: profile.role,
      created_at: profile.created_at,
    };

    return reply.code(201).send({ data: result });
  });

  // PATCH /users/:id — update user
  fastify.patch<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Ошибка валидации', details: parsed.error.flatten() });
    }

    // Prevent demoting the last admin
    if (parsed.data.role === 'user') {
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if ((count ?? 0) <= 1) {
        // Check if this user IS the last admin
        const { data: target } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', id)
          .single();

        if (target?.role === 'admin') {
          return reply.code(400).send({ error: 'Нельзя понизить последнего администратора' });
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.display_name) updateData.display_name = parsed.data.display_name;
    if (parsed.data.role) updateData.role = parsed.data.role;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update user');
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    return { data };
  });

  // DELETE /users/:id — delete user
  fastify.delete<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    // Prevent deleting yourself
    if (id === request.user.id) {
      return reply.code(400).send({ error: 'Нельзя удалить самого себя' });
    }

    // Prevent deleting the last admin
    const { data: target } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (target?.role === 'admin') {
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if ((count ?? 0) <= 1) {
        return reply.code(400).send({ error: 'Нельзя удалить последнего администратора' });
      }
    }

    // Delete profile (cascade from auth.users won't work here since we delete auth user after)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id);

    if (profileError) {
      request.log.error(profileError, 'Failed to delete user profile');
      return reply.code(500).send({ error: 'Не удалось удалить пользователя' });
    }

    // Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      request.log.error(authError, 'Failed to delete auth user');
    }

    return reply.code(204).send();
  });
};

export default userRoutes;
