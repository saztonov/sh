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
      // Дожидаемся signOut, чтобы localStorage был очищен до любого редиректа.
      // onAuthStateChange в AuthContext обновит user → ProtectedRoute сделает Navigate.
      await supabase.auth.signOut();
      isLoggingOut = false;
    }
    return Promise.reject(error);
  },
);

export default api;
