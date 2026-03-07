import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tutor, TutorSessionResolved, TutorSessionException } from '@homework/shared';
import api from '../lib/api';

// ── Tutors directory ──

export function useTutors() {
  return useQuery<Tutor[]>({
    queryKey: ['tutors'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Tutor[] }>('/api/tutors');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<{ data: Tutor }>('/api/tutors', { name });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutors'] }),
  });
}

export function useUpdateTutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await api.put<{ data: Tutor }>(`/api/tutors/${id}`, { name });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutors'] }),
  });
}

export function useDeleteTutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/tutors/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tutors'] });
      qc.invalidateQueries({ queryKey: ['tutor-sessions'] });
    },
  });
}

// ── Tutor sessions ──

export function useTutorSessions(weekOffset: number) {
  return useQuery<TutorSessionResolved[]>({
    queryKey: ['tutor-sessions', weekOffset],
    queryFn: async () => {
      const { data } = await api.get<{ data: TutorSessionResolved[] }>(
        '/api/tutor-sessions',
        { params: { week_offset: weekOffset } },
      );
      return data.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateTutorSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      tutor_id: string;
      subject: string;
      day_of_week: number;
      time_start: string;
      is_recurring: boolean;
      specific_date?: string | null;
    }) => {
      const { data } = await api.post('/api/tutor-sessions', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutor-sessions'] }),
  });
}

export function useDeleteTutorSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/tutor-sessions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutor-sessions'] }),
  });
}

export function useRescheduleOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      original_date,
      new_date,
      new_time,
    }: {
      id: string;
      original_date: string;
      new_date: string;
      new_time: string;
    }) => {
      const { data } = await api.post<{ data: TutorSessionException }>(
        `/api/tutor-sessions/${id}/reschedule-one`,
        { original_date, new_date, new_time },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutor-sessions'] }),
  });
}

export function useRescheduleFollowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      from_date,
      new_day_of_week,
      new_time,
    }: {
      id: string;
      from_date: string;
      new_day_of_week: number;
      new_time: string;
    }) => {
      const { data } = await api.post(
        `/api/tutor-sessions/${id}/reschedule-following`,
        { from_date, new_day_of_week, new_time },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tutor-sessions'] }),
  });
}
