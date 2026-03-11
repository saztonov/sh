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
  (error) => {
    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true;
      // Синхронно очищаем все ключи Supabase из localStorage, затем делаем хард-редирект.
      // Нельзя полагаться на supabase.auth.signOut() + onAuthStateChange:
      // — TanStack Query v5 не awaits async onSuccess, создавая race window
      // — admin.updateUserById пушит USER_UPDATED с newSession, что перезаписывает user=null
      // Хард-редирект гарантирует свежую инициализацию SDK с пустым localStorage.
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-')) localStorage.removeItem(key);
      });
      window.location.replace('/login');
    }
    return Promise.reject(error);
  },
);

export default api;
