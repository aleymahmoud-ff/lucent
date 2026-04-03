"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModelSummary, ForecastMetrics } from "@/types";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function methodLabel(method: string): string {
  switch (method.toLowerCase()) {
    case "arima":
      return "ARIMA — AutoRegressive Integrated Moving Average";
    case "ets":
      return "ETS — Error, Trend, Seasonality (Exponential Smoothing)";
    case "prophet":
      return "Prophet — Additive Regression Model by Meta";
    default:
      return method;
  }
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(6);
  return String(value);
}

// -------------------------------------------------------
// Sub-components
// -------------------------------------------------------

function KVGrid({ title, entries }: { title: string; entries: [string, unknown][] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground capitalize">
              {key.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-foreground">{formatParamValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Public component
// -------------------------------------------------------

interface ModelSummaryPanelProps {
  modelSummary: ModelSummary;
  metrics?: ForecastMetrics;
}

export function ModelSummaryPanel({ modelSummary, metrics }: ModelSummaryPanelProps) {
  const { method, parameters, coefficients } = modelSummary;

  const paramEntries = Object.entries(parameters ?? {});
  const coeffEntries = Object.entries(coefficients ?? {});

  // Diagnostics from nested modelSummary.diagnostics (if present)
  const diagnostics = modelSummary.diagnostics;
  const diagEntries = diagnostics
    ? Object.entries(diagnostics).filter(
        ([, v]) => v !== null && v !== undefined && typeof v !== "object"
      )
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Summary</CardTitle>
        <CardDescription>{methodLabel(method)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Method badge row + information criteria */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="uppercase">{method}</Badge>
          {metrics?.aic != null && (
            <Badge variant="outline">AIC: {metrics.aic.toFixed(2)}</Badge>
          )}
          {metrics?.bic != null && (
            <Badge variant="outline">BIC: {metrics.bic.toFixed(2)}</Badge>
          )}
          {metrics?.mse != null && (
            <Badge variant="outline">MSE: {metrics.mse.toFixed(4)}</Badge>
          )}
        </div>

        {/* Parameters */}
        {paramEntries.length > 0 && (
          <KVGrid title="Parameters" entries={paramEntries} />
        )}

        {/* Coefficients */}
        {coeffEntries.length > 0 && (
          <KVGrid
            title="Coefficients"
            entries={coeffEntries.map(([k, v]) => [k, typeof v === "number" ? v.toFixed(6) : v])}
          />
        )}

        {/* Diagnostics */}
        {diagEntries.length > 0 && (
          <KVGrid title="Diagnostics" entries={diagEntries} />
        )}

        {/* Empty state */}
        {paramEntries.length === 0 && coeffEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No detailed model information available for this forecast.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
