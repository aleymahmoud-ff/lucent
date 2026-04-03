"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Home,
  Users,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

const adminNavigation = [
  { name: "Dashboard", href: "/admin", icon: Home },
  { name: "Tenants", href: "/admin/tenants", icon: Building2 },
  { name: "All Users", href: "/admin/users", icon: Users },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem("platform_token");
      const storedAdmin = localStorage.getItem("platform_admin");

      if (!token || !storedAdmin) {
        router.push("/login");
        return;
      }

      try {
        // Verify token is still valid
        const response = await api.get<PlatformAdmin>("/platform/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAdmin(response);
        localStorage.setItem("platform_admin", JSON.stringify(response));
      } catch (error) {
        // Token invalid, clear and redirect
        localStorage.removeItem("platform_token");
        localStorage.removeItem("platform_admin");
        router.push("/login");
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("platform_token");
    localStorage.removeItem("platform_admin");
    router.push("/login");
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!admin) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="flex h-full w-64 flex-col border-r bg-background">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Shield className="h-6 w-6 text-red-600" />
          <span className="ml-2 text-xl font-bold">Platform Admin</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {adminNavigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname?.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-red-600 text-white"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-medium text-white">
              {admin.full_name?.[0]?.toUpperCase() || admin.email[0].toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">
                {admin.full_name || admin.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Platform Admin
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">Platform Administration</h1>
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              Platform Admin Access
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {admin.email}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
