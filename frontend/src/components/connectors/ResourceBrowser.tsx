"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FolderOpen,
  Table2,
  AlertCircle,
  RefreshCw,
  FileText,
} from "lucide-react";
import { connectorApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface ResourceBrowserProps {
  connectorId: string;
  connectorName: string;
  selectedResource: string | null;
  onSelectResource: (resource: string) => void;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ResourceBrowser({
  connectorId,
  connectorName,
  selectedResource,
  onSelectResource,
}: ResourceBrowserProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["connectors", connectorId, "resources"],
    queryFn: () => connectorApi.getResources(connectorId),
    enabled: !!connectorId,
  });

  const resources = data?.resources ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4" />
              Resources
            </CardTitle>
            <CardDescription className="text-xs">
              Tables and files available in {connectorName}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh resources"
          >
            <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading resources...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm font-medium">Failed to load resources</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <FileText className="h-6 w-6" />
            <p className="text-sm">No resources found</p>
            <p className="text-xs">This connector has no accessible tables or files</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {resources.map((resource) => (
              <button
                key={resource}
                onClick={() => onSelectResource(resource)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                  resource === selectedResource
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{resource}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
