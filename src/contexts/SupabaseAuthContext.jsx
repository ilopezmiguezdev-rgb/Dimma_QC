import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from "@/components/ui/use-toast";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) return null;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          full_name, avatar_url, role,
          user_laboratories (
            laboratory:laboratories(id, name)
          )
        `)
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user profile:", error.message);
        return null;
      }

      const assignedLabs = (profile?.user_laboratories || [])
        .map(ul => ul.laboratory)
        .filter(Boolean);

      return { ...profile, assignedLabs };
    } catch (err) {
      console.error("Unexpected error fetching profile:", err);
      return null;
    }
  }, []);

  const handleSession = useCallback(async (currentSession) => {
    const authUser = currentSession?.user || null;
    if (authUser) {
      const profile = await fetchUserProfile(authUser);
      const role = profile?.role || authUser.user_metadata?.role || null;
      setUser({ ...authUser, profile: profile || null, role });
    } else {
      setUser(null);
    }
    setSession(currentSession);
    setLoading(false);
  }, [fetchUserProfile]);

  useEffect(() => {
    let mounted = true;

    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) await handleSession(session);
      } catch (error) {
        console.error("Error getting session:", error);
        // Even if session fetch fails, we stop loading to show the app (likely login screen)
        if (mounted) setLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      if (mounted) await handleSession(session);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [handleSession]);

  const signUp = useCallback(async (email, password, options) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options });
      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error en el registro",
        description: error.message || "Algo salió mal.",
      });
      return { user: null, error };
    }
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: error.message || "Credenciales incorrectas.",
      });
      return { user: null, error };
    }
  }, [toast]);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al cerrar sesión",
        description: error.message || "Algo salió mal.",
      });
    }
  }, [toast]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    passwordRecovery,
    signUp,
    signIn,
    signOut,
    clearPasswordRecovery,
  }), [user, session, loading, passwordRecovery, signUp, signIn, signOut, clearPasswordRecovery]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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