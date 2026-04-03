"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { authApi } from "@/lib/api/endpoints";

/**
 * Tenant User - belongs to a specific tenant
 * This is separate from Platform Admins who use platform_token/platform_admin
 */
interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: string;
  tenant_slug: string | null;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  last_login: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tenantSlug: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const isAuthenticated = !!token && !!user;
  const tenantSlug = user?.tenant_slug || (params?.tenant as string) || null;

  const checkAuth = async (): Promise<boolean> => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!storedToken || !storedUser) {
      setToken(null);
      setUser(null);
      setIsLoading(false);
      return false;
    }

    try {
      // Verify token is still valid by calling /me endpoint
      const userData = await authApi.me();
      setToken(storedToken);
      setUser(userData as unknown as User);
      localStorage.setItem("user", JSON.stringify(userData));
      setIsLoading(false);
      return true;
    } catch (error) {
      // Token is invalid, clear storage
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
      setIsLoading(false);
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    localStorage.setItem("token", response.access_token);
    localStorage.setItem("user", JSON.stringify(response.user));
    setToken(response.access_token);
    setUser(response.user as unknown as User);
  };

  const logout = () => {
    const currentTenantSlug = user?.tenant_slug;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    // Redirect to tenant login page
    if (currentTenantSlug) {
      router.push(`/${currentTenantSlug}/login`);
    } else {
      router.push("/login");
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated,
        tenantSlug,
        login,
        logout,
        checkAuth,
      }}
    >
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
