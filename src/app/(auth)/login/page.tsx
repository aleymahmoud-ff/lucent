"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { api } from "@/lib/api/client";

interface PlatformAdminResponse {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface PlatformAuthResponse {
  access_token: string;
  token_type: string;
  admin: PlatformAdminResponse;
}

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Platform admin login endpoint
      const response = await api.post<PlatformAuthResponse>("/platform/login", {
        email,
        password,
      });

      // Store platform admin token and info
      localStorage.setItem("platform_token", response.access_token);
      localStorage.setItem("platform_admin", JSON.stringify(response.admin));

      // Redirect to platform admin dashboard
      router.push("/admin");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid credentials. This login is for platform administrators only.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <Card className="w-full max-w-md border-red-600/20">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-600/10 rounded-full">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Platform Administration</CardTitle>
          <CardDescription>
            Sign in with your platform administrator credentials
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
                placeholder="admin@lucent.com"
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
                placeholder="••••••••"
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
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in as Platform Admin"}
            </Button>

            <p className="text-xs text-center text-gray-500">
              This login is for LUCENT platform administrators only.
              <br />
              Tenant users should use their organization's login URL.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
