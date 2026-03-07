import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserProfile, UserRole } from '@homework/shared';
import api from '../lib/api';

export function useUsers() {
  return useQuery<UserProfile[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get<{ data: UserProfile[] }>('/api/users');
      return data.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      display_name: string;
      email: string;
      password: string;
      role: UserRole;
    }) => {
      const { data } = await api.post<{ data: UserProfile }>('/api/users', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      display_name?: string;
      role?: UserRole;
    }) => {
      const { data } = await api.patch(`/api/users/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/users/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
