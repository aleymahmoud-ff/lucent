"use client";

import { useState, type ElementType } from "react";
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
import { Download, CheckCircle2, XCircle, TrendingUp, Target, Percent, BarChart3 } from "lucide-react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Prediction {
  date: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

interface Metrics {
  mae: number;
  rmse: number;
  mape: number;
  mse?: number;
  r2?: number;
}

interface ForecastResult {
  id: string;
  dataset_id: string;
  entity_id: string;
  method: string;
  status: string;
  progress: number;
  predictions: Prediction[];
  metrics: Metrics;
  model_summary: {
    method: string;
    parameters: Record<string, unknown>;
    coefficients?: Record<string, number>;
    diagnostics?: Record<string, unknown>;
    regressors_used?: string[];
  };
  created_at: string;
  completed_at?: string;
  error?: string;
}

interface BatchForecastResult {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  status: string;
  results: ForecastResult[];
}

interface BatchForecastResultsProps {
  batchResult: BatchForecastResult;
}

export function BatchForecastResults({ batchResult }: BatchForecastResultsProps) {
  const completedResults = batchResult.results.filter((r) => r.status === "completed");
  const failedResults = batchResult.results.filter((r) => r.status === "failed");

  const [selectedEntityId, setSelectedEntityId] = useState<string>(
    completedResults[0]?.entity_id || ""
  );

  const selectedResult = completedResults.find((r) => r.entity_id === selectedEntityId);

  const handleExportAll = () => {
    const headers = ["Entity", "Date", "Forecast", "Lower Bound", "Upper Bound"];
    const rows: string[][] = [];
    for (const result of completedResults) {
      for (const p of result.predictions) {
        rows.push([
          result.entity_id,
          p.date,
          p.value.toFixed(4),
          p.lower_bound.toFixed(4),
          p.upper_bound.toFixed(4),
        ]);
      }
    }
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch_forecast_${batchResult.batch_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Batch Forecast Summary</CardTitle>
              <CardDescription>
                {batchResult.total} entities processed
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportAll}>
              <Download className="h-4 w-4 mr-2" />
              Export All CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{batchResult.completed} completed</span>
            </div>
            {batchResult.failed > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">{batchResult.failed} failed</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Entity Selector */}
      {completedResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entity Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select entity to view" />
              </SelectTrigger>
              <SelectContent>
                {completedResults.map((result) => (
                  <SelectItem key={result.entity_id} value={result.entity_id}>
                    <div className="flex items-center gap-2">
                      <span>{result.entity_id}</span>
                      <Badge variant="outline" className="text-xs">
                        MAPE: {result.metrics.mape.toFixed(1)}%
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedResult && (
              <>
                {/* Metrics Row */}
                <div className="grid grid-cols-4 gap-3">
                  <MetricMini icon={Target} label="MAE" value={selectedResult.metrics.mae.toFixed(2)} />
                  <MetricMini icon={TrendingUp} label="RMSE" value={selectedResult.metrics.rmse.toFixed(2)} />
                  <MetricMini icon={Percent} label="MAPE" value={`${selectedResult.metrics.mape.toFixed(1)}%`} />
                  <MetricMini icon={BarChart3} label="R\u00B2" value={(selectedResult.metrics.r2 ?? 0).toFixed(3)} />
                </div>

                {/* Chart */}
                <Plot
                  data={[
                    {
                      x: selectedResult.predictions.map((p) => p.date),
                      y: selectedResult.predictions.map((p) => p.value),
                      type: "scatter",
                      mode: "lines",
                      name: "Forecast",
                      line: { color: "#3b82f6", width: 2 },
                    },
                    {
                      x: [
                        ...selectedResult.predictions.map((p) => p.date),
                        ...selectedResult.predictions.map((p) => p.date).reverse(),
                      ],
                      y: [
                        ...selectedResult.predictions.map((p) => p.upper_bound),
                        ...selectedResult.predictions.map((p) => p.lower_bound).reverse(),
                      ],
                      fill: "toself",
                      fillcolor: "rgba(59, 130, 246, 0.1)",
                      line: { color: "transparent" },
                      name: "Confidence Interval",
                    },
                  ]}
                  layout={{
                    autosize: true,
                    height: 350,
                    margin: { l: 60, r: 20, t: 30, b: 60 },
                    title: { text: selectedResult.entity_id, font: { size: 14 } },
                    xaxis: { title: { text: "Date" }, tickangle: -45 },
                    yaxis: { title: { text: "Value" } },
                    showlegend: true,
                    legend: { orientation: "h", y: -0.3 },
                    hovermode: "x unified",
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: "100%" }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failed Entities */}
      {failedResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-destructive">Failed Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {failedResults.map((result) => (
                <div
                  key={result.entity_id}
                  className="flex items-start justify-between p-2 bg-destructive/5 rounded text-sm"
                >
                  <span className="font-medium">{result.entity_id}</span>
                  <span className="text-destructive text-xs">{result.error || "Unknown error"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricMini({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-2 bg-muted rounded text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
