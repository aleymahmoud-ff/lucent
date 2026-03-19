"use client";

import { Suspense } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  Activity,
  BarChart3,
  Waves,
  Settings2,
  Gauge,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  ResidualChart,
  ACFChart,
  QualityGauge,
  SeasonalityPanel,
  ModelParametersPanel,
} from "@/components/diagnostics";
import { diagnosticsApi } from "@/lib/api/endpoints";
import { useForecastStore } from "@/stores/forecastStore";

// -------------------------------------------------------
// QueryClient — scoped to diagnostics page
// -------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes — diagnostics don't change
      retry: 2,
    },
  },
});

// -------------------------------------------------------
// Raw API shape (snake_case from backend)
// -------------------------------------------------------

interface RawResidualAnalysis {
  residuals: number[];
  acf: number[];
  pacf: number[];
  acf_confidence?: number;
  ljung_box: {
    statistic: number;
    p_value: number;
  };
  jarque_bera: {
    statistic: number;
    p_value: number;
  };
  is_white_noise: boolean;
}

interface RawModelParameters {
  method: string;
  parameters: Record<string, unknown>;
  coefficients?: Record<string, number>;
  standard_errors?: Record<string, number>;
  aic?: number;
  bic?: number;
}

interface RawSeasonalityAnalysis {
  seasonal_strength: number;
  trend_strength: number;
  detected_period?: number | null;
  seasonal_component?: number[] | null;
}

interface RawQualityIndicators {
  accuracy: number;
  stability: number;
  reliability: number;
  coverage: number;
}

interface RawDiagnosticsFull {
  forecast_id: string;
  residuals: RawResidualAnalysis;
  parameters: RawModelParameters;
  seasonality: RawSeasonalityAnalysis;
  quality: RawQualityIndicators;
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
      <Activity className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">No Forecast Selected</h2>
      <p className="text-muted-foreground max-w-md">
        Run a forecast first, then come here to inspect residuals, seasonality patterns, and model
        quality. You can also append{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">?forecastId=&lt;id&gt;</code> to the
        URL to load diagnostics directly.
      </p>
      <Button className="mt-6" onClick={() => router.push(`/${tenant}/forecast`)}>
        <Play className="h-4 w-4 mr-2" />
        Go to Forecast
      </Button>
    </div>
  );
}

// -------------------------------------------------------
// Main diagnostics view (requires forecastId)
// -------------------------------------------------------

function DiagnosticsView({ forecastId }: { forecastId: string }) {
  const { data: raw, isLoading, isError, error } = useQuery<RawDiagnosticsFull>({
    queryKey: ["diagnostics", forecastId],
    queryFn: () => diagnosticsApi.get(forecastId) as unknown as Promise<RawDiagnosticsFull>,
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
          <p className="font-semibold text-lg">Failed to load diagnostics</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "The diagnostics data could not be retrieved."}
          </p>
          <p className="text-xs text-muted-foreground font-mono">ID: {forecastId}</p>
        </CardContent>
      </Card>
    );
  }

  // Destructure the full bundle
  const { residuals, parameters, seasonality, quality } = raw;

  return (
    <div className="space-y-6">
      {/* Header metadata row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default">Diagnostics</Badge>
        {parameters?.method && (
          <Badge variant="outline" className="uppercase">{parameters.method}</Badge>
        )}
      </div>

      {/* Quality gauges — always visible above tabs */}
      {quality && (
        <QualityGauge quality={quality} />
      )}

      {/* Tabbed detail view */}
      <Tabs defaultValue="residuals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="residuals" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Residuals
          </TabsTrigger>
          <TabsTrigger value="seasonality" className="gap-2">
            <Waves className="h-4 w-4" />
            Seasonality
          </TabsTrigger>
          <TabsTrigger value="model" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Model
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2">
            <Gauge className="h-4 w-4" />
            Quality
          </TabsTrigger>
        </TabsList>

        {/* Residuals tab — scatter plot + ACF/PACF */}
        <TabsContent value="residuals" className="space-y-6">
          {residuals ? (
            <>
              <ResidualChart
                residuals={residuals.residuals}
                ljungBox={residuals.ljung_box}
                jarqueBera={residuals.jarque_bera}
                isWhiteNoise={residuals.is_white_noise}
              />
              <ACFChart
                acf={residuals.acf}
                pacf={residuals.pacf}
                acfConfidence={residuals.acf_confidence}
              />
            </>
          ) : (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <p className="text-muted-foreground">No residual analysis available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Seasonality tab */}
        <TabsContent value="seasonality" className="space-y-6">
          {seasonality ? (
            <SeasonalityPanel
              seasonalStrength={seasonality.seasonal_strength}
              trendStrength={seasonality.trend_strength}
              detectedPeriod={seasonality.detected_period}
              seasonalComponent={seasonality.seasonal_component}
            />
          ) : (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <p className="text-muted-foreground">No seasonality analysis available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Model tab — parameters, coefficients, AIC/BIC */}
        <TabsContent value="model" className="space-y-6">
          {parameters ? (
            <ModelParametersPanel
              method={parameters.method}
              parameters={parameters.parameters}
              coefficients={parameters.coefficients}
              standardErrors={parameters.standard_errors}
              aic={parameters.aic}
              bic={parameters.bic}
            />
          ) : (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <p className="text-muted-foreground">No model parameter information available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Quality tab — detailed gauges + explanations */}
        <TabsContent value="quality" className="space-y-6">
          {quality ? (
            <Card>
              <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <QualityDetailCard
                    label="Accuracy"
                    value={quality.accuracy}
                    description="How close forecast values are to actual observations. Derived from error metrics like MAPE and RMSE."
                  />
                  <QualityDetailCard
                    label="Stability"
                    value={quality.stability}
                    description="How consistent the model's predictions are across different time windows. Lower variance indicates higher stability."
                  />
                  <QualityDetailCard
                    label="Reliability"
                    value={quality.reliability}
                    description="Statistical confidence in the model. Based on residual diagnostics, Ljung-Box test, and model fit statistics."
                  />
                  <QualityDetailCard
                    label="Coverage"
                    value={quality.coverage}
                    description="Proportion of actual values that fall within the predicted confidence intervals."
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex h-48 items-center justify-center">
                <p className="text-muted-foreground">No quality indicators available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -------------------------------------------------------
// Quality detail card — used in quality tab
// -------------------------------------------------------

function QualityDetailCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  function getColor(v: number): string {
    if (v >= 80) return "bg-green-500";
    if (v >= 50) return "bg-yellow-500";
    return "bg-red-500";
  }

  function getTextColor(v: number): string {
    if (v >= 80) return "text-green-600";
    if (v >= 50) return "text-yellow-600";
    return "text-red-600";
  }

  function getRating(v: number): string {
    if (v >= 80) return "Excellent";
    if (v >= 60) return "Good";
    if (v >= 50) return "Fair";
    return "Poor";
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold tabular-nums ${getTextColor(clamped)}`}>
            {Math.round(clamped)}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {getRating(clamped)}
          </Badge>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// -------------------------------------------------------
// Page shell — reads forecastId from URL or store
// -------------------------------------------------------

function DiagnosticsPageContent() {
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
          <h1 className="text-2xl font-bold">Diagnostics</h1>
          <p className="text-muted-foreground">
            Analyze forecast quality with residual diagnostics, seasonality, and model comparison
          </p>
        </div>
        {forecastId && (
          <p className="text-xs text-muted-foreground font-mono hidden sm:block">
            {forecastId}
          </p>
        )}
      </div>

      {forecastId ? (
        <DiagnosticsView forecastId={forecastId} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// -------------------------------------------------------
// Default export — wraps with QueryClientProvider + Suspense
// -------------------------------------------------------

export default function DiagnosticsPage() {
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
        <DiagnosticsPageContent />
      </Suspense>
    </QueryClientProvider>
  );
}
