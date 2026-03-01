import { useQuery } from '@tanstack/react-query';
import type { MergedScheduleDay } from '@homework/shared';
import api from '../lib/api';

interface MergedScheduleResponse {
  data: MergedScheduleDay[];
}

/**
 * Fetch the merged schedule (schedule slots + assignments) for a given week.
 * @param weekOffset - 0 = current week, -1 = last week, 1 = next week, etc.
 */
export function useMergedSchedule(weekOffset: number) {
  return useQuery<MergedScheduleDay[]>({
    queryKey: ['schedule', 'merged', weekOffset],
    queryFn: async () => {
      const { data } = await api.get<MergedScheduleResponse>('/api/schedule/merged', {
        params: { week_offset: weekOffset },
      });
      return data.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}
