"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, AuthUser } from "@/lib/api";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // One-time cleanup: older clients stored the JWT in localStorage, which
    // is now unused but would otherwise sit there indefinitely, readable by
    // any XSS -- exactly what moving to httpOnly cookies is meant to avoid.
    localStorage.removeItem("token");

    const unsubscribe = api.onSessionExpired(() => setUser(null));

    // The access/refresh tokens live in httpOnly cookies, so there's nothing
    // to read client-side -- just ask the backend who (if anyone) they
    // belong to. A 401 here is a normal "not logged in" case, handled by
    // api.ts's refresh-then-SessionExpiredError flow.
    api
      .get<{ id: string; email: string; name?: string }>("/api/me")
      .then((userData) => {
        setUser(userData);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setUser(result.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const result = await api.register(email, password, name);
    setUser(result.user);
  };

  const logout = () => {
    setUser(null);
    api.logout().catch(() => {
      // Best-effort server-side revoke -- UI already reflects logged-out state.
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
