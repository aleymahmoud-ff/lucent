"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Database, RefreshCw } from "lucide-react";
import { tenantAdminApi, type ConnectorWithRLS } from "@/lib/api/endpoints";
import { ConnectorCard, type ConnectorCardData } from "./ConnectorCard";

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface ConnectorListProps {
  selectedConnectorId: string | null;
  onSelectConnector: (connector: ConnectorCardData) => void;
  onBrowseResources: (connector: ConnectorCardData) => void;
  onPreviewData: (connector: ConnectorCardData) => void;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ConnectorList({
  selectedConnectorId,
  onSelectConnector,
  onBrowseResources,
  onPreviewData,
}: ConnectorListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["connectors", "list"],
    queryFn: () => tenantAdminApi.listConnectors({ limit: 100 }),
  });

  const connectors = data?.connectors ?? [];

  // Client-side filtering for search and status
  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.type.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && c.is_active) ||
        (statusFilter === "inactive" && !c.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [connectors, search, statusFilter]);

  // ---- Loading ----
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading connectors...</p>
      </div>
    );
  }

  // ---- Error ----
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-destructive">
        <Database className="h-8 w-8" />
        <p className="font-medium">Failed to load connectors</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search connectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh connector list"
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {/* Connector count */}
      <p className="text-xs text-muted-foreground">
        {filteredConnectors.length} connector{filteredConnectors.length !== 1 ? "s" : ""}
        {search || statusFilter !== "all" ? " (filtered)" : ""}
      </p>

      {/* Connector cards */}
      {filteredConnectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Database className="h-8 w-8" />
          <p className="text-sm font-medium">No connectors found</p>
          <p className="text-xs">
            {search || statusFilter !== "all"
              ? "Try adjusting your search or filter"
              : "Create connectors in the Data section first"}
          </p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
          {filteredConnectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              isSelected={connector.id === selectedConnectorId}
              onSelect={onSelectConnector}
              onBrowseResources={onBrowseResources}
              onPreviewData={onPreviewData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
