import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const ResetPasswordPage = () => {
  const { clearPasswordRecovery } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [recoveryReady, setRecoveryReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeout;

    const init = async () => {
      // 1. PKCE path: ?code= query parameter (Supabase v2 default)
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        console.log('[recovery] exchangeCodeForSession:', { data, error });
        if (!cancelled && data?.session && !error) {
          setRecoveryReady(true);
          return;
        }
      }

      // 2. Hash path (legacy fallback): #access_token= + #refresh_token=
      const frag = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = frag.get('access_token');
      const refreshToken = frag.get('refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        console.log('[recovery] setSession:', { data, error });
        if (!cancelled && data?.session && !error) {
          setRecoveryReady(true);
          return;
        }
      }

      // 3. Session already exists (AuthProvider may have handled it)
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[recovery] getSession:', session);
      if (!cancelled && session) {
        setRecoveryReady(true);
        return;
      }

      // 4. Nothing worked — timeout and redirect
      //    (no extra onAuthStateChange — AuthProvider already has one)
      timeout = setTimeout(() => {
        if (cancelled) return;
        toast({
          title: 'Enlace invalido',
          description: 'El enlace de recuperacion no es valido o ha expirado.',
          variant: 'destructive',
        });
        navigate('/login');
      }, 10000);
    };

    init();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [navigate, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Las contraseñas no coinciden.',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'La contraseña debe tener al menos 6 caracteres.',
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo actualizar la contraseña.',
      });
    } else {
      toast({
        title: 'Contraseña actualizada',
        description: 'Su contraseña ha sido restablecida exitosamente.',
      });
      clearPasswordRecovery();
      navigate('/', { replace: true });
    }
  };

  if (!recoveryReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Verificando enlace de recuperacion...</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Restablecer Contraseña - DIMMA QC</title>
      </Helmet>

      <div className="min-h-screen flex bg-background">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-4">
                <img src="https://horizons-cdn.hostinger.com/770b05f8-546d-4c93-9876-b17441ae2f8f/51750a6ee84fc1f5ad8b11fe7d362ac8.jpg" alt="DIMMA QC Logo" className="w-24 h-24 mx-auto" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Restablecer Contraseña</h1>
              <p className="text-muted-foreground">Ingrese su nueva contraseña</p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-muted-foreground mb-2">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="pl-10 pr-10 w-full px-3 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-white"
                      placeholder="Ingrese su nueva contraseña"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-muted-foreground mb-2">
                    Confirmar Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="pl-10 w-full px-3 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-white"
                      placeholder="Confirme su nueva contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full medical-gradient text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Restablecer Contraseña'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResetPasswordPage;
