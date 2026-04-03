"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

interface DataPreviewTableProps {
  datasetId: string;
  initialColumns?: string[];
}

interface PreviewData {
  columns: string[];
  data: Record<string, any>[];
  total_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export function DataPreviewTable({ datasetId, initialColumns }: DataPreviewTableProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    fetchPreview(currentPage);
  }, [datasetId, currentPage]);

  const fetchPreview = async (page: number) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<PreviewData>(
        `/datasets/${datasetId}/preview?page=${page}&page_size=${pageSize}`
      );
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data preview");
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (preview?.total_pages || 1)) {
      setCurrentPage(page);
    }
  };

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "-";
    }
    if (typeof value === "number") {
      // Format numbers nicely
      if (Number.isInteger(value)) {
        return value.toLocaleString();
      }
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  };

  if (loading && !preview) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Loading data preview...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            <p className="font-medium">Error loading preview</p>
            <p className="text-sm mt-1">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => fetchPreview(currentPage)}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Data Preview</CardTitle>
          <span className="text-sm text-muted-foreground">
            {preview.total_rows.toLocaleString()} rows, {preview.columns.length} columns
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {/* Table container with horizontal scroll */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center sticky left-0 bg-background">#</TableHead>
                {preview.columns.map((column) => (
                  <TableHead key={column} className="min-w-[120px] whitespace-nowrap">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.data.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="text-center text-muted-foreground sticky left-0 bg-background">
                    {(currentPage - 1) * pageSize + rowIndex + 1}
                  </TableCell>
                  {preview.columns.map((column) => (
                    <TableCell
                      key={column}
                      className={
                        row[column] === null || row[column] === undefined
                          ? "text-muted-foreground italic"
                          : ""
                      }
                    >
                      {formatCellValue(row[column])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {preview.total_pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, preview.total_rows)} of{" "}
              {preview.total_rows.toLocaleString()} rows
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1 || loading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm">
                Page {currentPage} of {preview.total_pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === preview.total_pages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(preview.total_pages)}
                disabled={currentPage === preview.total_pages || loading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
