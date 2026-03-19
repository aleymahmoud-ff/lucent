"use client";

import { Suspense } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LineChart, AlertCircle, BarChart3, Table2, FileDown, Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  MetricsCards,
  ForecastChart,
  ResultsTable,
  ModelSummaryPanel,
  ExportPanel,
} from "@/components/results";
import { resultsApi } from "@/lib/api/endpoints";
import { useForecastStore } from "@/stores/forecastStore";

// -------------------------------------------------------
// QueryClient — scoped to results page
// -------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes — results don't change
      retry: 2,
    },
  },
});

// -------------------------------------------------------
// Raw API shape (snake_case from backend)
// -------------------------------------------------------

interface RawPrediction {
  date: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

interface RawForecastResult {
  id: string;
  dataset_id: string;
  entity_id: string;
  method: "arima" | "ets" | "prophet";
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  predictions: RawPrediction[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    mse?: number;
    r2?: number;
    aic?: number;
    bic?: number;
  };
  model_summary: {
    method: string;
    parameters: Record<string, unknown>;
    coefficients?: Record<string, number>;
    diagnostics?: Record<string, unknown>;
  };
  created_at: string;
  completed_at?: string;
  error?: string;
}

// -------------------------------------------------------
// Helpers — normalise snake_case → camelCase
// -------------------------------------------------------

function normaliseResult(raw: RawForecastResult) {
  return {
    id: raw.id,
    datasetId: raw.dataset_id,
    entityId: raw.entity_id,
    method: raw.method,
    status: raw.status,
    progress: raw.progress,
    predictions: raw.predictions.map((p) => ({
      date: p.date,
      value: p.value,
      lowerBound: p.lower_bound,
      upperBound: p.upper_bound,
    })),
    metrics: {
      mae: raw.metrics.mae,
      rmse: raw.metrics.rmse,
      mape: raw.metrics.mape,
      mse: raw.metrics.mse,
      r2: raw.metrics.r2,
      aic: raw.metrics.aic,
      bic: raw.metrics.bic,
    },
    modelSummary: {
      method: raw.model_summary.method,
      parameters: raw.model_summary.parameters,
      coefficients: raw.model_summary.coefficients,
      diagnostics: raw.model_summary.diagnostics as any,
    },
    createdAt: raw.created_at,
    completedAt: raw.completed_at,
    error: raw.error,
  };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "outline" | "secondary" | "destructive" }> = {
    completed: { label: "Completed", variant: "default" },
    running: { label: "Running", variant: "secondary" },
    pending: { label: "Pending", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

// -------------------------------------------------------
// Empty state
// -------------------------------------------------------

function EmptyState() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <LineChart className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">No Forecast Selected</h2>
      <p className="text-muted-foreground max-w-md">
        Run a forecast first, then return here to explore predictions, accuracy metrics, and export
        the results. You can also append{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">?forecastId=&lt;id&gt;</code> to the
        URL to load a specific result directly.
      </p>
      <Button className="mt-6" onClick={() => router.push(`/${tenant}/forecast`)}>
        <Play className="h-4 w-4 mr-2" />
        Go to Forecast
      </Button>
    </div>
  );
}

// -------------------------------------------------------
// Main results view (requires forecastId)
// -------------------------------------------------------

function ResultsView({ forecastId }: { forecastId: string }) {
  const { data: raw, isLoading, isError, error } = useQuery<RawForecastResult>({
    queryKey: ["results", forecastId],
    queryFn: () => resultsApi.getResult(forecastId) as unknown as Promise<RawForecastResult>,
    enabled: !!forecastId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-64 items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (isError || !raw) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-destructive">
          <AlertCircle className="h-10 w-10" />
          <p className="font-semibold text-lg">Failed to load results</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "The forecast result could not be retrieved."}
          </p>
          <p className="text-xs text-muted-foreground font-mono">ID: {forecastId}</p>
        </CardContent>
      </Card>
    );
  }

  if (raw.status !== "completed") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Info className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-lg">Result not ready</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {statusBadge(raw.status)}
          </div>
          {raw.error && (
            <p className="text-sm text-destructive">{raw.error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const result = normaliseResult(raw);

  return (
    <div className="space-y-6">
      {/* Header metadata row */}
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(result.status)}
        <Badge variant="outline" className="uppercase">{result.method}</Badge>
        {result.entityId && (
          <Badge variant="outline">{result.entityId}</Badge>
        )}
      </div>

      {/* Metrics summary */}
      <MetricsCards metrics={result.metrics} />

      {/* Tabbed detail view */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Table2 className="h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="model" className="gap-2">
            <Info className="h-4 w-4" />
            Model
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <FileDown className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Overview — chart */}
        <TabsContent value="overview" className="space-y-6">
          <ForecastChart
            predictions={result.predictions}
            entityId={result.entityId}
            method={result.method}
          />
        </TabsContent>

        {/* Data — paginated predictions table */}
        <TabsContent value="data">
          <ResultsTable forecastId={forecastId} pageSize={50} />
        </TabsContent>

        {/* Model summary */}
        <TabsContent value="model">
          <ModelSummaryPanel
            modelSummary={result.modelSummary}
            metrics={result.metrics}
          />
        </TabsContent>

        {/* Export */}
        <TabsContent value="export">
          <ExportPanel
            forecastId={forecastId}
            entityId={result.entityId}
            method={result.method}
            createdAt={result.createdAt}
            completedAt={result.completedAt}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -------------------------------------------------------
// Page shell — reads forecastId from URL or store
// -------------------------------------------------------

function ResultsPageContent() {
  const searchParams = useSearchParams();
  const urlForecastId = searchParams.get("forecastId");

  // Fallback: check Zustand store for a recently completed forecast
  const storeForecastId = useForecastStore(
    (s) => s.forecastResults?.id ?? null
  );

  const forecastId = urlForecastId ?? storeForecastId;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Results</h1>
          <p className="text-muted-foreground">
            View forecast predictions, metrics, and export results
          </p>
        </div>
        {forecastId && (
          <p className="text-xs text-muted-foreground font-mono hidden sm:block">
            {forecastId}
          </p>
        )}
      </div>

      {forecastId ? (
        <ResultsView forecastId={forecastId} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// -------------------------------------------------------
// Default export — wraps with QueryClientProvider + Suspense
// -------------------------------------------------------

export default function ResultsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="flex flex-col h-64 items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        }
      >
        <ResultsPageContent />
      </Suspense>
    </QueryClientProvider>
  );
}
