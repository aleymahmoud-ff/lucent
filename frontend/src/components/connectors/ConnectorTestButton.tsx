"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Plug } from "lucide-react";
import { connectorApi } from "@/lib/api/endpoints";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConnectorTestButtonProps {
  connectorId: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  onResult?: (result: { success: boolean; message: string }) => void;
}

export function ConnectorTestButton({
  connectorId,
  variant = "outline",
  size = "sm",
  className,
  onResult,
}: ConnectorTestButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(true);
    setResult(null);

    try {
      const res = await connectorApi.test(connectorId);
      setResult(res);
      onResult?.(res);

      if (res.success) {
        toast.success("Connection test passed", {
          description: res.message,
        });
      } else {
        toast.error("Connection test failed", {
          description: res.message,
        });
      }
    } catch (err: any) {
      const failResult = {
        success: false,
        message: err.response?.data?.detail || "Connection test failed",
      };
      setResult(failResult);
      onResult?.(failResult);
      toast.error("Connection test failed", {
        description: failResult.message,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Button
        variant={variant}
        size={size}
        onClick={handleTest}
        disabled={testing}
      >
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Testing...
          </>
        ) : (
          <>
            <Plug className="h-4 w-4 mr-1.5" />
            Test
          </>
        )}
      </Button>

      {result && !testing && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            result.success ? "text-green-600" : "text-red-600"
          )}
        >
          {result.success ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {result.success ? "OK" : "Failed"}
        </span>
      )}
    </div>
  );
}
