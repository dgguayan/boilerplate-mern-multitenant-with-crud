import { createContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout } from '../api/auth.api.js';

export const AuthContext = createContext(null);

const ROLE_HIERARCHY = { superadmin: 4, admin: 3, manager: 2, user: 1 };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const stored = localStorage.getItem('user');
    if (token && stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await apiLogin(credentials);
    const { accessToken, user: userData } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    sessionStorage.removeItem('securityPasswordConfirmation');
    setUser(null);
  }, []);

  // Check if user has at least the given role
  const hasRole = useCallback((role) => {
    if (!user) return false;
    return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[role] || 0);
  }, [user]);

  const can = useCallback((action) => {
    const permissions = {
      create_project: hasRole('manager'),
      delete_project: hasRole('manager'),
      manage_users: hasRole('admin'),
      manage_tenants: hasRole('superadmin'),
    };
    return permissions[action] ?? false;
  }, [hasRole]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, can }}>
      {children}
    </AuthContext.Provider>
  );
}
