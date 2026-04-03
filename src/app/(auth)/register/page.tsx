"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BarChart3, Shield } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-8">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-600/20 rounded-full">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">Organization Registration</CardTitle>
          <CardDescription className="text-gray-400">
            New organizations must be created by a Platform Administrator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-700 border border-gray-600 text-gray-300 px-4 py-3 rounded text-sm">
            <p className="mb-2">
              <strong>For Existing Organizations:</strong>
            </p>
            <p className="text-gray-400">
              If your organization already exists, please ask your administrator for the login URL
              (e.g., <code className="bg-gray-600 px-1 rounded">/your-org/login</code>)
            </p>
          </div>

          <div className="bg-gray-700 border border-gray-600 text-gray-300 px-4 py-3 rounded text-sm">
            <p className="mb-2">
              <strong>For New Organizations:</strong>
            </p>
            <p className="text-gray-400">
              Contact the Platform Administrator to request a new organization be created.
            </p>
          </div>

          <div className="pt-4 space-y-3">
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full bg-gray-700 border-gray-600 text-white hover:bg-gray-600">
                Platform Admin Login
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
