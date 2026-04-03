"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { resultsApi } from "@/lib/api/endpoints";

// -------------------------------------------------------
// Types — backend returns snake_case, we normalise here
// -------------------------------------------------------

interface RawPrediction {
  date: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

interface PredictionsResponse {
  data: RawPrediction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface ResultsTableProps {
  forecastId: string;
  pageSize?: number;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 2 });
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ResultsTable({ forecastId, pageSize = 50 }: ResultsTableProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useQuery<PredictionsResponse>({
    queryKey: ["results", "data", forecastId, page, pageSize],
    queryFn: () => resultsApi.getData(forecastId, page, pageSize) as unknown as Promise<PredictionsResponse>,
    enabled: !!forecastId,
    placeholderData: (prev) => prev, // keep old data while fetching next page
  });

  const totalPages = data?.total_pages ?? 1;
  const total = data?.total ?? 0;
  const predictions = data?.data ?? [];
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  const goTo = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  // ---- Loading skeleton ----
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // ---- Error state ----
  if (isError) {
    return (
      <Card>
        <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="font-medium">Failed to load prediction data</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Prediction Data</CardTitle>
            <CardDescription>
              {total.toLocaleString()} predictions with confidence intervals
            </CardDescription>
          </div>
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center text-muted-foreground">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Predicted Value</TableHead>
                <TableHead className="text-right">Lower Bound</TableHead>
                <TableHead className="text-right">Upper Bound</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No predictions available
                  </TableCell>
                </TableRow>
              ) : (
                predictions.map((p, i) => (
                  <TableRow key={p.date + i}>
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {firstRow + i}
                    </TableCell>
                    <TableCell className="font-medium">{p.date}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(p.value)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmt(p.lower_bound)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmt(p.upper_bound)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of{" "}
              {total.toLocaleString()} rows
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goTo(1)}
                disabled={page === 1 || isFetching}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goTo(page - 1)}
                disabled={page === 1 || isFetching}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goTo(page + 1)}
                disabled={page === totalPages || isFetching}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goTo(totalPages)}
                disabled={page === totalPages || isFetching}
                aria-label="Last page"
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
