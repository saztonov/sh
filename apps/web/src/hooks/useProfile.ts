import { useQuery } from '@tanstack/react-query';
import type { UserProfile } from '@homework/shared';
import api from '../lib/api';

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get<{ data: UserProfile }>('/api/auth/me');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
