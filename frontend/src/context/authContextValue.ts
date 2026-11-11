import { createContext } from 'react';

export interface AuthContextType {
  isAuthenticated: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  loading: boolean;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
