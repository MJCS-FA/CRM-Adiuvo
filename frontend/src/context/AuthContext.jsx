import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { clearSession, getStoredToken, getStoredUser, storeSession } from '../utils/sessionStorage';

export const AuthContext = createContext({
  token: '',
  user: null,
  isAuthenticated: false,
  isBooting: true,
  login: async () => {},
  logout: () => {}
});

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(getStoredUser());
  const [isBooting, setIsBooting] = useState(true);

  const canKeepOfflineSession = useCallback((error) => {
    if (!token || !user) {
      return false;
    }

    const statusCode = Number(error?.response?.status || 0);

    if (error?.code === 'OFFLINE_UNAVAILABLE' || error?.code === 'OFFLINE_CACHE_MISS') {
      return true;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }

    if (statusCode >= 500) {
      return true;
    }

    return !error?.response;
  }, [token, user]);

  const logout = useCallback(() => {
    clearSession();
    setToken('');
    setUser(null);
    setIsBooting(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      if (!token) {
        if (isMounted) {
          setIsBooting(false);
        }
        return;
      }

      try {
        const response = await authService.me();

        if (!isMounted) {
          return;
        }

        setUser(response.user);
        storeSession(token, response.user);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (canKeepOfflineSession(error)) {
          setIsBooting(false);
          return;
        }

        logout();
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [token, logout, canKeepOfflineSession]);

  const login = useCallback(async (credentials) => {
    const response = await authService.login(credentials);
    setToken(response.token);
    setUser(response.user);
    setIsBooting(false);
    storeSession(response.token, response.user);
    return response;
  }, []);

  const contextValue = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isBooting,
      login,
      logout
    }),
    [token, user, isBooting, login, logout]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

