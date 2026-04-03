"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api/client";
import { tenantsPublicApi, brandingApi, BrandingSettings } from "@/lib/api/endpoints";
import { useAuth } from "@/contexts/AuthContext";

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

interface UserResponse {
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

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

// Default branding
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

export default function TenantLoginPage() {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params?.tenant as string;
  const { checkAuth } = useAuth();

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Validate tenant and fetch branding
  useEffect(() => {
    async function validateTenant() {
      if (!tenantSlug) return;

      try {
        const tenantInfo = await tenantsPublicApi.getBySlug(tenantSlug);
        if (!tenantInfo.is_active) {
          setTenantError("This organization is currently inactive.");
        } else {
          setTenant(tenantInfo);

          // Fetch branding
          try {
            const brandingResponse = await brandingApi.getBranding(tenantSlug);
            setBranding(brandingResponse.branding);
          } catch (err) {
            // Use default branding if fetch fails
            console.error("Failed to fetch branding:", err);
          }
        }
      } catch (err) {
        setTenantError("Organization not found.");
      } finally {
        setTenantLoading(false);
      }
    }

    validateTenant();
  }, [tenantSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Use tenant-specific login endpoint with backend validation
      const response = await api.post<AuthResponse>(`/auth/tenant/${tenantSlug}/login`, {
        email,
        password,
      });

      // Store user token and info
      localStorage.setItem("token", response.access_token);
      localStorage.setItem("user", JSON.stringify(response.user));

      // Update AuthContext state
      await checkAuth();

      // Redirect to tenant dashboard
      router.push(`/${tenantSlug}/dashboard`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail?.includes("pending approval")) {
        setError("Your account is pending approval. Please contact your administrator.");
      } else if (detail?.includes("do not have access")) {
        setError("Your account is not associated with this organization.");
      } else if (detail?.includes("Organization not found")) {
        setError("Organization not found.");
      } else if (detail?.includes("Organization is not active")) {
        setError("This organization is currently inactive.");
      } else {
        setError(detail || "Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Tenant error state
  if (tenantError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-red-600">Organization Not Found</CardTitle>
            <CardDescription>{tenantError}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <p className="text-sm text-gray-500">
              Please check the URL or contact your administrator.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Background style
  const bgStyle = branding.login_bg_url
    ? {
        backgroundImage: `url(${branding.login_bg_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
      style={bgStyle}
    >
      {/* Overlay for background image */}
      {branding.login_bg_url && (
        <div className="absolute inset-0 bg-black/50" />
      )}

      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={tenant?.name || 'Logo'}
                className="h-12 max-w-[200px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                className="p-3 rounded-full"
                style={{ backgroundColor: `${branding.colors.primary}20` }}
              >
                <BarChart3
                  className="h-8 w-8"
                  style={{ color: branding.colors.primary }}
                />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold">{tenant?.name}</CardTitle>
          <CardDescription>
            {branding.login_message || "Sign in to access your organization's dashboard"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full text-white"
              style={{ backgroundColor: branding.colors.primary }}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>

            <div className="text-sm text-center text-gray-600">
              Don't have an account?{" "}
              <Link
                href={`/${tenantSlug}/register`}
                className="hover:underline"
                style={{ color: branding.colors.primary }}
              >
                Request access
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
