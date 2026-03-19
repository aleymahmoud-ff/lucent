"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Dynamic import — Plotly cannot run on the server
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[350px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ACFChartProps {
  acf: number[];
  pacf?: number[];
  acfConfidence?: number;
  title?: string;
}

// -------------------------------------------------------
// Sub-chart builder
// -------------------------------------------------------

function buildBarChart(
  values: number[],
  confidence: number,
  chartTitle: string,
  color: string
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const maxLags = Math.min(values.length, 20);
  const lags = Array.from({ length: maxLags }, (_, i) => i);
  const trimmed = values.slice(0, maxLags);

  const data: Plotly.Data[] = [
    // ACF/PACF bars
    {
      x: lags,
      y: trimmed,
      type: "bar" as const,
      name: chartTitle,
      marker: {
        color: trimmed.map((v) =>
          Math.abs(v) > confidence ? "#ef4444" : color
        ),
      },
      hovertemplate: "<b>Lag %{x}</b><br>Value: %{y:.4f}<extra></extra>",
    },
    // Upper confidence line
    {
      x: [0, maxLags - 1],
      y: [confidence, confidence],
      type: "scatter" as const,
      mode: "lines" as const,
      name: "Confidence",
      line: { color: "#94a3b8", width: 1, dash: "dash" },
      showlegend: false,
      hoverinfo: "skip" as const,
    },
    // Lower confidence line
    {
      x: [0, maxLags - 1],
      y: [-confidence, -confidence],
      type: "scatter" as const,
      mode: "lines" as const,
      name: "-Confidence",
      line: { color: "#94a3b8", width: 1, dash: "dash" },
      showlegend: false,
      hoverinfo: "skip" as const,
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 300,
    margin: { l: 50, r: 20, t: 30, b: 50 },
    title: {
      text: chartTitle,
      font: { size: 14 },
      x: 0.01,
      xanchor: "left",
    },
    xaxis: {
      title: { text: "Lag", standoff: 8 },
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
      dtick: 1,
    },
    yaxis: {
      title: { text: "Correlation", standoff: 8 },
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
      range: [-1, 1],
    },
    showlegend: false,
    hovermode: "closest",
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
  };

  return { data, layout };
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ACFChart({ acf, pacf, acfConfidence, title }: ACFChartProps) {
  const confidence = acfConfidence ?? 1.96 / Math.sqrt(acf?.length || 50);

  if (!acf || acf.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[350px] items-center justify-center">
          <p className="text-muted-foreground">No ACF data available.</p>
        </CardContent>
      </Card>
    );
  }

  const acfChart = buildBarChart(acf, confidence, "Autocorrelation (ACF)", "#3b82f6");
  const pacfChart = pacf && pacf.length > 0
    ? buildBarChart(pacf, confidence, "Partial Autocorrelation (PACF)", "#8b5cf6")
    : null;

  const config: Partial<Plotly.Config> = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title ?? "Autocorrelation Analysis"}</CardTitle>
        <CardDescription>
          Bars exceeding the dashed confidence bands indicate statistically significant correlations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Plot
          data={acfChart.data}
          layout={acfChart.layout}
          config={config}
          style={{ width: "100%" }}
          useResizeHandler
        />
        {pacfChart && (
          <Plot
            data={pacfChart.data}
            layout={pacfChart.layout}
            config={config}
            style={{ width: "100%" }}
            useResizeHandler
          />
        )}
      </CardContent>
    </Card>
  );
}
