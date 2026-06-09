import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import authFetch from '../utils/api';

export interface AuthContextType {
  isAuthenticated: boolean;
  isStaff: boolean;
  loading: boolean;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
    setIsStaff(false);
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      setIsAuthenticated(false);
      setIsStaff(false);
      return;
    }

    try {
      const res = await authFetch('/api/users/session/');
      if (res.ok) {
        const json = await res.json();
        setIsAuthenticated(json.isAuthenticated);
        setIsStaff(json.isStaff || json.isSuperuser);
      } else {
        logout();
      }
    } catch (e) {
      console.error("Auth check failed:", e);
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    window.addEventListener('logout', logout);
    return () => window.removeEventListener('logout', logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isStaff, loading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
