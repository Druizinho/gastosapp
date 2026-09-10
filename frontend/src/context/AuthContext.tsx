import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { getProfile } from '../api';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  displayName: string;
  signOut: () => Promise<void>;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const profile = await getProfile();
      if (profile?.display_name) {
        setDisplayName(profile.display_name);
      }
    } catch (error) {
      // Profile might not exist yet, fall back to user_metadata or email
      console.log('Profile fetch failed, using fallback');
    }
  };

  const deriveDisplayName = (currentUser: User | null) => {
    if (!currentUser) {
      setDisplayName('');
      return;
    }
    // Fallback chain: user_metadata > email
    const metaName = currentUser.user_metadata?.display_name;
    const email = currentUser.email || '';
    setDisplayName(metaName || email.split('@')[0] || 'Usuario');
  };

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      deriveDisplayName(session?.user ?? null);
      setLoading(false);
      
      // Fetch profile from API (async, will update displayName when ready)
      if (session?.user) {
        fetchProfile();
      }
    });

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      deriveDisplayName(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        fetchProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    await fetchProfile();
  };

  return (
    <AuthContext.Provider value={{ session, user, displayName, signOut, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
