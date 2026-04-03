"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Cloud,
  Snowflake,
  Globe,
  Server,
  FolderOpen,
  Table2,
} from "lucide-react";
import { ConnectorTestButton } from "./ConnectorTestButton";
import { cn } from "@/lib/utils";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface ConnectorCardData {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  created_at: string;
  rls_config?: {
    id: string;
    connector_id: string;
    rls_column: string;
    is_enabled: boolean;
    created_at: string;
    updated_at: string;
  } | null;
}

interface ConnectorCardProps {
  connector: ConnectorCardData;
  isSelected: boolean;
  onSelect: (connector: ConnectorCardData) => void;
  onBrowseResources: (connector: ConnectorCardData) => void;
  onPreviewData: (connector: ConnectorCardData) => void;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const connectorTypeLabels: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlserver: "SQL Server",
  s3: "Amazon S3",
  azure_blob: "Azure Blob",
  gcs: "Google Cloud Storage",
  bigquery: "BigQuery",
  snowflake: "Snowflake",
  api: "REST API",
};

function getConnectorIcon(type: string) {
  switch (type) {
    case "postgres":
    case "mysql":
    case "sqlserver":
    case "bigquery":
      return Database;
    case "s3":
    case "azure_blob":
    case "gcs":
      return Cloud;
    case "snowflake":
      return Snowflake;
    case "api":
      return Globe;
    default:
      return Server;
  }
}

function getConnectorCategoryColor(type: string): string {
  switch (type) {
    case "postgres":
    case "mysql":
    case "sqlserver":
    case "bigquery":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "s3":
    case "azure_blob":
    case "gcs":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "snowflake":
      return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "api":
      return "bg-purple-100 text-purple-700 border-purple-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ConnectorCard({
  connector,
  isSelected,
  onSelect,
  onBrowseResources,
  onPreviewData,
}: ConnectorCardProps) {
  const Icon = getConnectorIcon(connector.type);
  const typeLabel = connectorTypeLabels[connector.type] || connector.type;
  const categoryColor = getConnectorCategoryColor(connector.type);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected
          ? "ring-2 ring-primary border-primary shadow-md"
          : "hover:border-muted-foreground/30"
      )}
      onClick={() => onSelect(connector)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: icon + name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                categoryColor
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{connector.name}</h3>
              <p className="text-xs text-muted-foreground">{typeLabel}</p>
            </div>
          </div>
          <Badge
            variant={connector.is_active ? "default" : "secondary"}
            className={cn(
              "shrink-0 text-[10px]",
              connector.is_active
                ? "bg-green-100 text-green-700 hover:bg-green-100"
                : "bg-gray-100 text-gray-500 hover:bg-gray-100"
            )}
          >
            {connector.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ConnectorTestButton connectorId={connector.id} size="sm" />

          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onBrowseResources(connector);
            }}
          >
            <FolderOpen className="h-4 w-4 mr-1.5" />
            Resources
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewData(connector);
            }}
          >
            <Table2 className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
