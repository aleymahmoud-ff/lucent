"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useParams } from "next/navigation";

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const tenantSlug = params?.tenant as string;

  useEffect(() => {
    // Log error for monitoring
    console.error("[TenantError]", error);
  }, [error]);

  // Detect common error types from the message
  const isUnauthorized =
    error.message?.includes("401") || error.message?.toLowerCase().includes("unauthorized");
  const isForbidden =
    error.message?.includes("403") || error.message?.toLowerCase().includes("forbidden");
  const isNotFound =
    error.message?.includes("404") || error.message?.toLowerCase().includes("not found");

  if (isUnauthorized) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
            <h2 className="text-xl font-semibold">Session Expired</h2>
            <p className="text-sm text-muted-foreground">
              Your session has expired or you are not logged in. Please log in again.
            </p>
            <Button asChild>
              <a href={`/${tenantSlug}/login`}>Go to Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              You do not have permission to access this page. Contact your administrator if you
              believe this is an error.
            </p>
            <Button variant="outline" asChild>
              <a href={`/${tenantSlug}/dashboard`}>
                <Home className="h-4 w-4 mr-2" />
                Back to Dashboard
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            {isNotFound
              ? "The requested resource could not be found."
              : "An unexpected error occurred while loading this page."}
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <a href={`/${tenantSlug}/dashboard`}>
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
