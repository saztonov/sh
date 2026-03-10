import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { SUPABASE_URL } from '../config';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let initialised = false;

    // onAuthStateChange is the single source of truth.
    // It fires INITIAL_SESSION on subscribe, so we don't need a separate getSession() call.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // First event (INITIAL_SESSION) ends the loading state
      if (!initialised) {
        initialised = true;
        setLoading(false);
      }

      // If Supabase could not refresh the token (expired refresh token → 401),
      // it fires SIGNED_OUT. Clear storage so stale tokens don't cause a loop.
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);

        // Страховка: принудительно удаляем ключ сессии из localStorage,
        // чтобы при race condition не осталось протухших токенов.
        const storageKey = `sb-${new URL(SUPABASE_URL || 'http://localhost').hostname.split('.')[0]}-auth-token`;
        localStorage.removeItem(storageKey);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signIn, signOut }),
    [user, session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
