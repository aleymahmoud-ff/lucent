"use client";

import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/contexts/AuthContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";

function TenantLayoutContent({ children }: { children: React.ReactNode }) {
  const { tenant, isLoading: isTenantLoading, isValid, error } = useTenant();
  const { isLoading: isAuthLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const tenantSlug = params.tenant as string;

  // Check if we're on a public page (login, register)
  const isPublicPage = pathname?.endsWith('/login') || pathname?.endsWith('/register');

  // For public pages, just render children without auth checks
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Show loading state while checking auth or validating tenant
  if (isAuthLoading || isTenantLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to tenant login if not authenticated
  if (!isAuthenticated) {
    router.push(`/${tenantSlug}/login`);
    return null;
  }

  // Show 404 if tenant is invalid
  if (!isValid || error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Organization Not Found</h2>
          <p className="text-gray-600 mb-6">
            The organization "{tenantSlug}" does not exist or is no longer active.
          </p>
          <button
            onClick={() => router.push(`/${tenantSlug}/login`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Verify user belongs to this tenant
  if (user && user.tenant_slug !== tenantSlug) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Wrong Organization</h2>
          <p className="text-gray-600 mb-6">
            You don't have access to this organization. Your organization is "{user.tenant_slug}".
          </p>
          <button
            onClick={() => router.push(`/${user.tenant_slug}/dashboard`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Your Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  return (
    <TenantProvider tenantSlug={tenantSlug}>
      <TenantLayoutContent>{children}</TenantLayoutContent>
    </TenantProvider>
  );
}
