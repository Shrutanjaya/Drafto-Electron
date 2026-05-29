import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { authService } from '@/lib/firebase/auth-service';
import { startGoogleAuth } from '@/lib/ipc/auth';
import { useNavigate } from 'react-router-dom';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen to auth state changes
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for force logout
    const handleForceLogout = (event: any) => {
      const reason = event.detail?.reason || 'Your session has been terminated';
      // Navigate to login with error message in URL
      navigate(`/login?error=${encodeURIComponent(reason)}`);
    };

    window.addEventListener('force-logout', handleForceLogout);

    return () => {
      unsubscribe();
      window.removeEventListener('force-logout', handleForceLogout);
    };
  }, [navigate]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await authService.signIn(email, password);
      
      if (result.wasForceLogout) {
        // Show notification that other session was logged out
        console.log('Other device session terminated');
      }
      
      return result.user;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      setError(null);
      setLoading(true);
      const user = await authService.signUp(email, password, displayName);
      return user;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setError(null);
      await authService.signOut();
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [navigate]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      await authService.resetPassword(email);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      if (!clientId) throw new Error('Google sign-in is not configured');
      const { idToken, accessToken } = await startGoogleAuth(clientId);
      await authService.signInWithGoogleCredential(idToken, accessToken);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
    isAuthenticated: !!user,
  };
}
