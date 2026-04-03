"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Table2,
  AlertCircle,
  RefreshCw,
  Database,
} from "lucide-react";
import { connectorApi } from "@/lib/api/endpoints";
import { useState } from "react";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface DataPreviewProps {
  connectorId: string;
  connectorName: string;
  resource: string | null;
}

interface FetchResponse {
  columns: string[];
  rows: Record<string, any>[];
  row_count: number;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const PAGE_SIZES = [10, 25, 50, 100] as const;

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function DataPreview({
  connectorId,
  connectorName,
  resource,
}: DataPreviewProps) {
  const [pageSize, setPageSize] = useState<number>(25);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<FetchResponse>({
    queryKey: ["connectors", connectorId, "fetch", resource, pageSize],
    queryFn: () =>
      connectorApi.fetch(connectorId, {
        table: resource ?? undefined,
        limit: pageSize,
      }),
    enabled: !!connectorId,
  });

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];
  const rowCount = data?.row_count ?? 0;

  // ---- No connector or resource yet ----
  if (!connectorId) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Table2 className="h-4 w-4" />
              Data Preview
            </CardTitle>
            <CardDescription className="text-xs">
              {resource ? (
                <>
                  Showing data from <span className="font-medium">{resource}</span> in{" "}
                  {connectorName}
                </>
              ) : (
                <>Preview data from {connectorName}</>
              )}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {rowCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""} total
              </Badge>
            )}

            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh data preview"
            >
              <RefreshCw
                className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Fetching data...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-destructive px-4">
            <AlertCircle className="h-6 w-6" />
            <p className="text-sm font-medium">Failed to fetch data</p>
            <p className="text-xs text-muted-foreground text-center">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 px-4">
            <Database className="h-6 w-6" />
            <p className="text-sm font-medium">No data available</p>
            <p className="text-xs">
              {resource
                ? "This resource contains no data"
                : "Select a resource to preview its data"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center text-muted-foreground">#</TableHead>
                  {columns.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No rows returned
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-center text-muted-foreground text-xs">
                        {i + 1}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          className="whitespace-nowrap text-sm font-mono max-w-[300px] truncate"
                        >
                          {formatCellValue(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Footer: row count summary */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Showing {rows.length.toLocaleString()} of {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""}
              </span>
              {isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
