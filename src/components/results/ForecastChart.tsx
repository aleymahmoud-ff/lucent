"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { Prediction } from "@/types";

// Dynamic import — Plotly cannot run on the server
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

interface ForecastChartProps {
  predictions: Prediction[];
  entityId?: string;
  method?: string;
}

export function ForecastChart({ predictions, entityId, method }: ForecastChartProps) {
  if (!predictions || predictions.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">No prediction data available.</p>
        </CardContent>
      </Card>
    );
  }

  const dates = predictions.map((p) => p.date);
  const values = predictions.map((p) => p.value);
  const lower = predictions.map((p) => p.lowerBound);
  const upper = predictions.map((p) => p.upperBound);

  // Confidence interval band: polygon — upper forward then lower reversed
  const ciX = [...dates, ...dates.slice().reverse()];
  const ciY = [...upper, ...lower.slice().reverse()];

  const data: Plotly.Data[] = [
    // Confidence interval band (rendered first so it sits behind the line)
    {
      x: ciX,
      y: ciY,
      fill: "toself" as const,
      fillcolor: "rgba(59, 130, 246, 0.12)",
      line: { color: "transparent", width: 0 },
      name: "Confidence Interval",
      type: "scatter" as const,
      mode: "lines" as const,
      showlegend: true,
      hoverinfo: "skip" as const,
    },
    // Forecast line
    {
      x: dates,
      y: values,
      type: "scatter" as const,
      mode: "lines" as const,
      name: "Forecast",
      line: { color: "#3b82f6", width: 2.5 },
      hovertemplate: "<b>%{x}</b><br>Value: %{y:.4f}<extra></extra>",
    },
    // Upper bound dashed line
    {
      x: dates,
      y: upper,
      type: "scatter" as const,
      mode: "lines" as const,
      name: "Upper Bound",
      line: { color: "#93c5fd", width: 1, dash: "dash" },
      hovertemplate: "<b>%{x}</b><br>Upper: %{y:.4f}<extra></extra>",
    },
    // Lower bound dashed line
    {
      x: dates,
      y: lower,
      type: "scatter" as const,
      mode: "lines" as const,
      name: "Lower Bound",
      line: { color: "#93c5fd", width: 1, dash: "dash" },
      hovertemplate: "<b>%{x}</b><br>Lower: %{y:.4f}<extra></extra>",
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 420,
    margin: { l: 60, r: 20, t: 20, b: 70 },
    xaxis: {
      title: { text: "Date", standoff: 12 },
      tickangle: -40,
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
    },
    yaxis: {
      title: { text: "Value", standoff: 8 },
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
    },
    showlegend: true,
    legend: {
      orientation: "h",
      y: -0.28,
      x: 0.5,
      xanchor: "center",
      font: { size: 12 },
    },
    hovermode: "x unified",
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
  };

  const config: Partial<Plotly.Config> = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
  };

  const subtitle = [entityId, method?.toUpperCase()].filter(Boolean).join(" — ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Forecast Chart</CardTitle>
        {subtitle && (
          <CardDescription>{subtitle}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <Plot
          data={data}
          layout={layout}
          config={config}
          style={{ width: "100%" }}
          useResizeHandler
        />
      </CardContent>
    </Card>
  );
}
