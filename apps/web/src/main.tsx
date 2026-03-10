import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';

import { AuthProvider } from './context/AuthContext';
import { theme } from './styles/theme';
import App from './App';
import './styles/global.css';

// Configure dayjs
dayjs.locale('ru');
dayjs.extend(isoWeek);
dayjs.extend(relativeTime);

// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Не ретраить при 401 — токен протух, повторные запросы бесполезны
        if (error && 'response' in error && (error as any).response?.status === 401) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 60 * 1000,
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ConfigProvider theme={theme} locale={ruRU}>
            <App />
          </ConfigProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
