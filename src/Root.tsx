import { useEffect, useState } from 'react';
import App from './App';
import { Login } from './components/Login';

const AUTH_STORAGE_KEY = 'dashboard-authenticated';

export function Root() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    } catch {
      // ignore persistence errors
    }
  }, [isAuthenticated]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  return <App onLogout={handleLogout} />;
}

export default Root;
