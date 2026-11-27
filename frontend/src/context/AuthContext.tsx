import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import authFetch from '../utils/api';
import { AuthContext } from './authContextValue';

// セッション確認を通信障害で失敗したときの再試行の回数と間隔
const SESSION_CHECK_ATTEMPTS = 3;
const SESSION_CHECK_RETRY_MS = 1000;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isPasswordExpired, setIsPasswordExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refresh_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
    setIsStaff(false);
    setIsSuperuser(false);
    setIsPasswordExpired(false);

    if (refreshToken) {
      // サーバー側でもrefreshトークンを失効させる（ベストエフォート。失敗してもローカルの状態は既にクリア済み）
      fetch('/api/users/token/blacklist/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      }).catch(() => {});
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      setIsAuthenticated(false);
      setIsStaff(false);
      setIsSuperuser(false);
      return;
    }

    if (import.meta.env.DEV && token === 'local-dev-admin-token') {
      setIsAuthenticated(true);
      setIsStaff(true);
      setIsSuperuser(true);
      setLoading(false);
      return;
    }

    // 一時的な通信障害(オフライン・サーバーエラー)ではログアウトしない。トークンを消すのは、
    // 認証できないと分かったとき(401/403)だけにする(消すと復旧後も再ログインが必要になるため)
    for (let attempt = 0; attempt < SESSION_CHECK_ATTEMPTS; attempt += 1) {
      try {
        const res = await authFetch('/api/users/session/');
        if (res.ok) {
          const json = await res.json();
          setIsAuthenticated(json.isAuthenticated);
          setIsStaff(json.isStaff || json.isSuperuser);
          setIsSuperuser(!!json.isSuperuser);
          setIsPasswordExpired(!!json.isPasswordExpired);
          setLoading(false);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          logout();
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Auth check failed:", e);
      }
      if (attempt < SESSION_CHECK_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, SESSION_CHECK_RETRY_MS));
      }
    }
    // 確認できなかった場合もトークンは残し、ログイン済みとして扱う(各画面の API が改めて認証する)
    setIsAuthenticated(true);
    setLoading(false);
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    window.addEventListener('logout', logout);
    return () => window.removeEventListener('logout', logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isStaff, isSuperuser, isPasswordExpired, loading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
