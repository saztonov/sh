import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Course, ScrapeRun, ScrapeLog } from '@homework/shared';
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

interface SessionStatusResponse {
  data: {
    status: 'valid' | 'invalid' | 'no_session' | 'unknown';
    checked_at: string | null;
    is_capturing: boolean;
  };
}

interface ActiveSubjectsResponse {
  data: string[];
}

/**
 * Fetch distinct subjects that have at least one active course.
 */
export function useActiveSubjects() {
  return useQuery<string[]>({
    queryKey: ['active-subjects'],
    queryFn: async () => {
      const { data } = await api.get<ActiveSubjectsResponse>('/api/courses/active-subjects');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
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
      queryClient.invalidateQueries({ queryKey: ['active-subjects'] });
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

/**
 * Fetch session status.
 * When isCapturing is true, polls more frequently (5s instead of 15s).
 */
export function useSessionStatus(isCapturing?: boolean) {
  return useQuery({
    queryKey: ['session-status'],
    queryFn: async () => {
      const { data } = await api.get<SessionStatusResponse>('/api/scraper/session-status');
      return data.data;
    },
    staleTime: isCapturing ? 3 * 1000 : 30 * 1000,
    refetchInterval: isCapturing ? 5 * 1000 : 15 * 1000,
  });
}

/**
 * Trigger session capture (opens browser for Google login).
 */
export function useCaptureSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/capture-session');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['session-status'] });
    },
  });
}

/**
 * Force-save the current browser session (user clicks when they see courses loaded).
 */
export function useForceSaveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/force-save-session');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['session-status'] });
    },
  });
}

/**
 * Trigger automatic Google login using saved credentials.
 */
export function useAutoLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/auto-login');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['session-status'] });
    },
  });
}

interface AutoLoginAvailableResponse {
  data: { available: boolean };
}

/**
 * Check if auto-login is available (GOOGLE_EMAIL / GOOGLE_PASSWORD configured).
 */
export function useAutoLoginAvailable() {
  return useQuery({
    queryKey: ['auto-login-available'],
    queryFn: async () => {
      const { data } = await api.get<AutoLoginAvailableResponse>('/api/scraper/auto-login-available');
      return data.data.available;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Trigger a combined scrape (Google Classroom + Eljur).
 */
export function useTriggerAllScrape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/trigger-all');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
    },
  });
}

interface ScrapeLogsResponse {
  data: ScrapeLog[];
}

interface ScrapeLogsPageResponse {
  data: ScrapeRun[];
  total: number;
}

/**
 * Fetch logs for a specific scrape run.
 */
export function useScrapeRunLogs(runId: string | null) {
  return useQuery<ScrapeLog[]>({
    queryKey: ['scrape-logs', runId],
    queryFn: async () => {
      if (!runId) return [];
      const { data } = await api.get<ScrapeLogsResponse>(`/api/scraper/logs/${runId}`);
      return data.data;
    },
    enabled: !!runId,
    staleTime: 10 * 1000,
  });
}

/**
 * Fetch paginated scrape runs for the logs tab.
 */
export function useScrapeLogsPage(page: number, pageSize: number) {
  return useQuery<{ data: ScrapeRun[]; total: number }>({
    queryKey: ['scrape-logs-page', page, pageSize],
    queryFn: async () => {
      const { data } = await api.get<ScrapeLogsPageResponse>(
        `/api/scraper/scrape-logs?page=${page}&pageSize=${pageSize}`,
      );
      return { data: data.data, total: data.total };
    },
    staleTime: 30 * 1000,
  });
}

// ─── Eljur hooks ───

/**
 * Fetch Eljur session status.
 */
export function useEljurSessionStatus(isCapturing?: boolean) {
  return useQuery({
    queryKey: ['eljur-session-status'],
    queryFn: async () => {
      const { data } = await api.get<SessionStatusResponse>('/api/scraper/eljur/session-status');
      return data.data;
    },
    staleTime: isCapturing ? 3 * 1000 : 30 * 1000,
    refetchInterval: isCapturing ? 5 * 1000 : 15 * 1000,
  });
}

/**
 * Trigger Eljur session capture (opens browser for manual login).
 */
export function useEljurCaptureSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/eljur/capture-session');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['eljur-session-status'] });
    },
  });
}

/**
 * Force-save the current Eljur browser session.
 */
export function useEljurForceSaveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/eljur/force-save-session');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['eljur-session-status'] });
    },
  });
}

/**
 * Trigger automatic Eljur login using saved credentials.
 */
export function useEljurAutoLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/eljur/auto-login');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
      queryClient.invalidateQueries({ queryKey: ['eljur-session-status'] });
    },
  });
}

/**
 * Trigger Eljur diary scrape.
 */
export function useTriggerEljurScrape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScrapeRunResponse>('/api/scraper/eljur/trigger');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape-runs'] });
    },
  });
}

/**
 * Check if Eljur auto-login is available (ELJUR_VENDOR / ELJUR_LOGIN / ELJUR_PASSWORD configured).
 */
export function useEljurAutoLoginAvailable() {
  return useQuery({
    queryKey: ['eljur-auto-login-available'],
    queryFn: async () => {
      const { data } = await api.get<AutoLoginAvailableResponse>('/api/scraper/eljur/auto-login-available');
      return data.data.available;
    },
    staleTime: 5 * 60 * 1000,
  });
}
