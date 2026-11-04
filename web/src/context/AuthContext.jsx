import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      setBusiness(data.business);
      return data.user;
    } catch (error) {
      if (error.status !== 401) {
        console.error(error);
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('cc:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cc:unauthorized', handleUnauthorized);
  }, [loadSession]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setUser(data.user);
    setBusiness(data.business);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // La sesión local se cierra incluso si el servidor no responde.
    }
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    return loadSession();
  }, [loadSession]);

  const hasPermission = useCallback((permission) => {
    if (!permission) return true;
    if (!user) return false;
    return user.permissions?.includes('*') || user.permissions?.includes(permission);
  }, [user]);

  const value = useMemo(() => ({
    user,
    business,
    loading,
    login,
    logout,
    refresh,
    hasPermission
  }), [user, business, loading, login, logout, refresh, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
