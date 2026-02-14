'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { api, ApiError } from '../services/api';
import { Role } from '../types';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'silvertown_access_token';
const REFRESH_TOKEN_KEY = 'silvertown_refresh_token';
const USER_KEY = 'silvertown_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    setIsLoading(false);
  }, []);

  // Manual refresh function
  const refreshTokenFn = useCallback(async (): Promise<string | null> => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) return null;

    try {
      const result = await api.auth.refresh(storedRefreshToken);
      setToken(result.accessToken);
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
      return result.accessToken;
    } catch (error) {
      // Refresh failed, log out
      await logout();
      return null;
    }
  }, []);

  // Track if we've done initial refresh
  const hasRefreshedRef = useRef(false);

  // Token refresh logic - runs on an interval
  useEffect(() => {
    if (!token) return;

    // Refresh immediately on first mount if we have a token (handles idle tabs)
    // Use ref to avoid infinite loop since refreshTokenFn updates token
    if (!hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      refreshTokenFn();
    }

    // Refresh token 1 minute before expiry (14 minutes)
    const interval = setInterval(refreshTokenFn, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token, refreshTokenFn]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await api.auth.login(email, password);

      setToken(result.accessToken);
      setUser(result.user as User);

      localStorage.setItem(TOKEN_KEY, result.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (storedRefreshToken && token) {
      try {
        await api.auth.logout(storedRefreshToken, token);
      } catch {
        // Ignore logout errors
      }
    }

    setToken(null);
    setUser(null);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, [token]);

  const hasRole = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        logout,
        hasRole,
        refreshToken: refreshTokenFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
