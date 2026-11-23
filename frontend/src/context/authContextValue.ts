import { createContext } from 'react';

export interface AuthContextType {
  isAuthenticated: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  /** パスワードの有効期限が切れている(変更するまで他の画面は使えない) */
  isPasswordExpired: boolean;
  loading: boolean;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
