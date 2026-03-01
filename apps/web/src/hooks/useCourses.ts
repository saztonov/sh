import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Course, ScrapeRun } from '@homework/shared';
import api from '../lib/api';

interface CoursesResponse {
  data: Course[];
}

interface ScrapeRunsResponse {
  data: ScrapeRun[];
}

interface ScrapeRunResponse {
  data: ScrapeRun;
}

/**
 * Fetch all courses.
 */
export function useCourses() {
  return useQuery<Course[]>({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data } = await api.get<CoursesResponse>('/api/courses');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Update a course (subject mapping, is_active toggle).
 */
export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Course, 'subject' | 'is_active'>>;
    }) => {
      const { data } = await api.patch(`/api/courses/${id}`, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

/**
 * Fetch scrape run history.
 */
export function useScrapeRuns() {
  return useQuery<ScrapeRun[]>({
    queryKey: ['scrape-runs'],
    queryFn: async () => {
      const { data } = await api.get<ScrapeRunsResponse>('/api/scraper/history');
      return data.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 15 * 1000, // Poll for status updates
  });
}

/**
 * Trigger a new scrape run.
 */
export function useTriggerScrape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/trigger');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
    },
  });
}
