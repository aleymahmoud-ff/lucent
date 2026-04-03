"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, AlertCircle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { diagnosticsApi } from "@/lib/api/endpoints";

// -------------------------------------------------------
// Raw API types (snake_case from backend)
// -------------------------------------------------------

interface RawModelComparison {
  forecast_id: string;
  method: string;
  entity_id: string;
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    r2?: number;
  };
  quality?: {
    accuracy: number;
    stability: number;
    reliability: number;
    coverage: number;
  };
}

interface RawComparisonResponse {
  models: RawModelComparison[];
  best_model: string;
}

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ModelComparisonTableProps {
  forecastIds: string[];
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatMetric(value: number | undefined | null, decimals = 4): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toFixed(decimals);
}

function formatPercent(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ModelComparisonTable({ forecastIds }: ModelComparisonTableProps) {
  const { data: raw, isLoading, isError, error } = useQuery<RawComparisonResponse>({
    queryKey: ["diagnostics-compare", ...forecastIds],
    queryFn: () => diagnosticsApi.compare(forecastIds) as unknown as Promise<RawComparisonResponse>,
    enabled: forecastIds.length >= 2,
  });

  if (forecastIds.length < 2) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <p className="text-muted-foreground">
            Select at least two forecasts to compare models.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !raw) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="font-semibold">Failed to load comparison</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not compare the selected forecasts."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const models = raw.models ?? [];
  const bestModel = raw.best_model;

  if (models.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <p className="text-muted-foreground">No comparison data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Model Comparison</CardTitle>
        <CardDescription>
          Comparing {models.length} models — best model highlighted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Forecast ID</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead className="text-right">MAE</TableHead>
              <TableHead className="text-right">RMSE</TableHead>
              <TableHead className="text-right">MAPE</TableHead>
              <TableHead className="text-right">R2</TableHead>
              <TableHead className="text-right">Accuracy</TableHead>
              <TableHead className="text-right">Stability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => {
              const isBest = model.forecast_id === bestModel;
              return (
                <TableRow
                  key={model.forecast_id}
                  className={cn(isBest && "bg-green-50 dark:bg-green-950/20")}
                >
                  <TableCell className="w-8">
                    {isBest && (
                      <Trophy className="h-4 w-4 text-yellow-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">
                      {model.forecast_id.slice(0, 8)}...
                    </span>
                    {isBest && (
                      <Badge variant="default" className="ml-2 text-[10px]">
                        Best
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {model.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {model.entity_id || "--"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMetric(model.metrics.mae)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMetric(model.metrics.rmse)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPercent(model.metrics.mape)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMetric(model.metrics.r2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {model.quality ? `${Math.round(model.quality.accuracy)}` : "--"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {model.quality ? `${Math.round(model.quality.stability)}` : "--"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
