"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, TrendingUp, Target, Percent, BarChart3 } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamic import for Plotly (client-side only)
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
  aic?: number;
  bic?: number;
}

interface ModelSummary {
  method: string;
  parameters: Record<string, unknown>;
  coefficients?: Record<string, number>;
  diagnostics?: Record<string, unknown>;
}

interface ForecastResult {
  id: string;
  dataset_id: string;
  entity_id: string;
  method: string;
  status: string;
  predictions: Prediction[];
  metrics: Metrics;
  model_summary: ModelSummary;
  created_at: string;
  completed_at?: string;
}

interface ForecastResultsProps {
  result: ForecastResult;
}

export function ForecastResults({ result }: ForecastResultsProps) {
  const { predictions, metrics, model_summary } = result;

  // Prepare chart data
  const dates = predictions.map((p) => p.date);
  const values = predictions.map((p) => p.value);
  const lower = predictions.map((p) => p.lower_bound);
  const upper = predictions.map((p) => p.upper_bound);

  const handleExport = () => {
    // Create CSV content
    const headers = ["Date", "Forecast", "Lower Bound", "Upper Bound"];
    const rows = predictions.map((p) =>
      [p.date, p.value.toFixed(4), p.lower_bound.toFixed(4), p.upper_bound.toFixed(4)]
    );
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    // Download
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast_${result.entity_id}_${result.method}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Metrics Summary */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          icon={Target}
          label="MAE"
          value={metrics.mae.toFixed(2)}
          description="Mean Absolute Error"
        />
        <MetricCard
          icon={TrendingUp}
          label="RMSE"
          value={metrics.rmse.toFixed(2)}
          description="Root Mean Square Error"
        />
        <MetricCard
          icon={Percent}
          label="MAPE"
          value={`${metrics.mape.toFixed(1)}%`}
          description="Mean Absolute % Error"
        />
        <MetricCard
          icon={BarChart3}
          label="R²"
          value={(metrics.r2 ?? 0).toFixed(3)}
          description="Coefficient of Determination"
        />
      </div>

      {/* Results Tabs */}
      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="model">Model</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Forecast Results</CardTitle>
                  <CardDescription>
                    {predictions.length} periods forecasted using {model_summary.method}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Plot
                data={[
                  {
                    x: dates,
                    y: values,
                    type: "scatter",
                    mode: "lines",
                    name: "Forecast",
                    line: { color: "#3b82f6", width: 2 },
                  },
                  {
                    x: [...dates, ...dates.slice().reverse()],
                    y: [...upper, ...lower.slice().reverse()],
                    fill: "toself",
                    fillcolor: "rgba(59, 130, 246, 0.1)",
                    line: { color: "transparent" },
                    name: "Confidence Interval",
                    showlegend: true,
                  },
                ]}
                layout={{
                  autosize: true,
                  height: 400,
                  margin: { l: 60, r: 20, t: 20, b: 60 },
                  xaxis: { title: { text: "Date" }, tickangle: -45 },
                  yaxis: { title: { text: "Value" } },
                  showlegend: true,
                  legend: { orientation: "h", y: -0.25 },
                  hovermode: "x unified",
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: "100%" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Forecast Data</CardTitle>
              <CardDescription>Predictions with confidence intervals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-right py-2 px-3 font-medium">Forecast</th>
                      <th className="text-right py-2 px-3 font-medium">Lower Bound</th>
                      <th className="text-right py-2 px-3 font-medium">Upper Bound</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 px-3">{p.date}</td>
                        <td className="text-right py-2 px-3 font-mono">
                          {p.value.toFixed(2)}
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-muted-foreground">
                          {p.lower_bound.toFixed(2)}
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-muted-foreground">
                          {p.upper_bound.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Summary</CardTitle>
              <CardDescription>Model parameters and diagnostics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Method Badge */}
              <div className="flex items-center gap-2">
                <Badge>{model_summary.method}</Badge>
                {metrics.aic && (
                  <Badge variant="outline">AIC: {metrics.aic.toFixed(2)}</Badge>
                )}
                {metrics.bic && (
                  <Badge variant="outline">BIC: {metrics.bic.toFixed(2)}</Badge>
                )}
              </div>

              {/* Parameters */}
              {model_summary.parameters && Object.keys(model_summary.parameters).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-sm">Parameters</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(model_summary.parameters).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between p-2 bg-muted rounded text-sm"
                      >
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coefficients */}
              {model_summary.coefficients && Object.keys(model_summary.coefficients).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-sm">Coefficients</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(model_summary.coefficients).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between p-2 bg-muted rounded text-sm"
                      >
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono">{value.toFixed(6)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnostics */}
              {model_summary.diagnostics && Object.keys(model_summary.diagnostics).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-sm">Diagnostics</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(model_summary.diagnostics)
                      .filter(([_, v]) => v !== null)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between p-2 bg-muted rounded text-sm"
                        >
                          <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
                          <span className="font-mono">
                            {typeof value === "number" ? value.toFixed(4) : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </CardContent>
    </Card>
  );
}
