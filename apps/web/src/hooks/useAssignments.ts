import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AssignmentWithCourse, AssignmentDetail, AssignmentFilters } from '@homework/shared';
import api from '../lib/api';

interface AssignmentsListResponse {
  data: AssignmentWithCourse[];
  total: number | null;
  limit: number;
  offset: number;
}

interface AssignmentDetailResponse {
  data: AssignmentDetail;
}

/**
 * Fetch paginated assignments list with optional filters.
 */
export function useAssignments(
  filters: AssignmentFilters & { limit?: number; offset?: number } = {},
) {
  return useQuery<AssignmentsListResponse>({
    queryKey: ['assignments', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};

      if (filters.status) params.status = filters.status;
      if (filters.subject) params.subject = filters.subject;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.completed !== undefined) params.completed = String(filters.completed);
      if (filters.limit !== undefined) params.limit = String(filters.limit);
      if (filters.offset !== undefined) params.offset = String(filters.offset);

      const { data } = await api.get<AssignmentsListResponse>('/api/assignments', { params });
      return data;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch a single assignment with full details and attachments.
 */
export function useAssignmentDetail(id: string | null) {
  return useQuery<AssignmentDetail>({
    queryKey: ['assignment', id],
    queryFn: async () => {
      const { data } = await api.get<AssignmentDetailResponse>(`/api/assignments/${id}`);
      return data.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Mutation to toggle the is_completed flag on an assignment.
 */
export function useToggleCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      const { data } = await api.patch(`/api/assignments/${id}`, {
        is_completed: isCompleted,
      });
      return data;
    },
    onSuccess: () => {
      // Invalidate all assignment-related queries so they refetch
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}
