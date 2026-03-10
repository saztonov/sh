import axios from 'axios';
import { API_BASE_URL } from '../config';
import { supabase } from './supabase';

/**
 * Pre-configured Axios instance for API calls.
 * Automatically attaches Supabase session token as Authorization header.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let isLoggingOut = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true;
      // scope: 'local' — очищаем localStorage без обращения к серверу Supabase.
      // При протухшем токене серверный signOut провалится, и локальная сессия не очистится.
      // Флаг isLoggingOut не сбрасываем — после 401 все дальнейшие запросы бесполезны.
      await supabase.auth.signOut({ scope: 'local' });
    }
    return Promise.reject(error);
  },
);

export default api;
