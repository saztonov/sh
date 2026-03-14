import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Difficulty, DifficultyDetail, DifficultyComment, DifficultyAttachment } from '@homework/shared';
import api from '../lib/api';

// ── List ──

export function useDifficulties(filters: { status?: string; subject?: string } = {}) {
  return useQuery<Difficulty[]>({
    queryKey: ['difficulties', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.subject) params.subject = filters.subject;
      const { data } = await api.get<{ data: Difficulty[] }>('/api/difficulties', { params });
      return data.data;
    },
    staleTime: 60 * 1000,
  });
}

// ── Detail ──

export function useDifficultyDetail(id: string | null) {
  return useQuery<DifficultyDetail>({
    queryKey: ['difficulty', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: DifficultyDetail }>(`/api/difficulties/${id}`);
      return data.data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// ── CRUD ──

export function useCreateDifficulty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { subject: string; title: string; comment?: string | null; deadline?: string | null }) => {
      const { data } = await api.post<{ data: Difficulty }>('/api/difficulties', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulties'] }),
  });
}

export function useUpdateDifficulty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; subject?: string; title?: string; comment?: string | null; deadline?: string | null; is_resolved?: boolean }) => {
      const { data } = await api.patch<{ data: Difficulty }>(`/api/difficulties/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['difficulties'] });
      qc.invalidateQueries({ queryKey: ['difficulty'] });
    },
  });
}

export function useDeleteDifficulty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/difficulties/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulties'] }),
  });
}

// ── Comments ──

export function useAddDifficultyComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ difficultyId, text }: { difficultyId: string; text: string }) => {
      const { data } = await api.post<{ data: DifficultyComment }>(`/api/difficulties/${difficultyId}/comments`, { text });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulty'] }),
  });
}

export function useDeleteDifficultyComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ difficultyId, commentId }: { difficultyId: string; commentId: string }) => {
      await api.delete(`/api/difficulties/${difficultyId}/comments/${commentId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulty'] }),
  });
}

// ── Attachments ──

export function useUploadDifficultyAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ difficultyId, file }: { difficultyId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ data: DifficultyAttachment }>(
        `/api/difficulties/${difficultyId}/attachments`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulty'] }),
  });
}

export function useDeleteDifficultyAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ difficultyId, attachmentId }: { difficultyId: string; attachmentId: string }) => {
      await api.delete(`/api/difficulties/${difficultyId}/attachments/${attachmentId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['difficulty'] }),
  });
}
