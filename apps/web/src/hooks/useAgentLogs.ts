import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface AgentLog {
  id: string;
  session_id: string;
  telegram_id: number | null;
  event_type: 'user_message' | 'model_request' | 'tool_call' | 'tool_result' | 'model_response' | 'error';
  provider: string | null;
  model: string | null;
  content: string | null;
  tool_name: string | null;
  tool_args: unknown;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

export interface AgentLogStats {
  period: string;
  since: string;
  totals: {
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    requests: number;
    sessions: number;
  };
  by_provider: Record<string, { tokens_in: number; tokens_out: number; requests: number }>;
  by_user: Record<string, { tokens_in: number; tokens_out: number; requests: number }>;
}

interface LogsResponse {
  data: AgentLog[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

interface LogsFilter {
  page?: number;
  page_size?: number;
  telegram_id?: number;
  event_type?: string;
  provider?: string;
  date_from?: string;
  date_to?: string;
  session_id?: string;
}

export function useAgentLogs(filter: LogsFilter = {}) {
  return useQuery<LogsResponse>({
    queryKey: ['agent-logs', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const { data } = await api.get<LogsResponse>(`/api/agent-logs?${params}`);
      return data;
    },
  });
}

export function useAgentLogSession(sessionId: string | null) {
  return useQuery<AgentLog[]>({
    queryKey: ['agent-log-session', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data } = await api.get<{ data: AgentLog[] }>(`/api/agent-logs/session/${sessionId}`);
      return data.data;
    },
  });
}

export function useAgentLogStats(period: 'day' | 'week' | 'month' | 'all' = 'week') {
  return useQuery<AgentLogStats>({
    queryKey: ['agent-log-stats', period],
    queryFn: async () => {
      const { data } = await api.get<AgentLogStats>(`/api/agent-logs/stats?period=${period}`);
      return data;
    },
    staleTime: 60 * 1000,
  });
}
