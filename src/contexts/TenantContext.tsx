"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { tenantsPublicApi, brandingApi, BrandingSettings } from "@/lib/api/endpoints";

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

// Default branding values
const defaultBranding: BrandingSettings = {
  logo_url: null,
  favicon_url: null,
  login_bg_url: null,
  login_message: null,
  colors: {
    primary: "#2563eb",
    secondary: "#1e40af",
    accent: "#3b82f6",
  },
};

interface TenantContextType {
  tenant: TenantInfo | null;
  branding: BrandingSettings;
  isLoading: boolean;
  isValid: boolean;
  error: string | null;
  refreshBranding: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
  tenantSlug: string;
}

export function TenantProvider({ children, tenantSlug }: TenantProviderProps) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchBranding = useCallback(async (slug: string) => {
    try {
      const response = await brandingApi.getBranding(slug);
      setBranding(response.branding);
    } catch (err) {
      console.error("Failed to fetch branding:", err);
      // Use default branding if fetch fails
      setBranding(defaultBranding);
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    if (tenantSlug) {
      await fetchBranding(tenantSlug);
    }
  }, [tenantSlug, fetchBranding]);

  useEffect(() => {
    const validateTenant = async () => {
      if (!tenantSlug) {
        setError("No tenant specified");
        setIsLoading(false);
        return;
      }

      try {
        const tenantData = await tenantsPublicApi.getBySlug(tenantSlug);
        setTenant(tenantData);
        setError(null);

        // Fetch branding after tenant is validated
        await fetchBranding(tenantSlug);
      } catch (err: any) {
        console.error("Failed to validate tenant:", err);
        setTenant(null);
        setError("Tenant not found");
      } finally {
        setIsLoading(false);
      }
    };

    validateTenant();
  }, [tenantSlug, fetchBranding]);

  const isValid = tenant !== null && !error;

  return (
    <TenantContext.Provider
      value={{
        tenant,
        branding,
        isLoading,
        isValid,
        error,
        refreshBranding,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
