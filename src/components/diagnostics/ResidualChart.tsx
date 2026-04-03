"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

// Dynamic import — Plotly cannot run on the server
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface LjungBox {
  statistic: number;
  p_value: number;
}

interface JarqueBera {
  statistic: number;
  p_value: number;
}

interface ResidualChartProps {
  residuals: number[];
  ljungBox?: LjungBox;
  jarqueBera?: JarqueBera;
  isWhiteNoise?: boolean;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ResidualChart({ residuals, ljungBox, jarqueBera, isWhiteNoise }: ResidualChartProps) {
  if (!residuals || residuals.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">No residual data available.</p>
        </CardContent>
      </Card>
    );
  }

  const indices = residuals.map((_, i) => i);

  const data: Plotly.Data[] = [
    // Residual scatter plot
    {
      x: indices,
      y: residuals,
      type: "scatter" as const,
      mode: "markers" as const,
      name: "Residuals",
      marker: {
        color: "#3b82f6",
        size: 5,
        opacity: 0.7,
      },
      hovertemplate: "<b>Index: %{x}</b><br>Residual: %{y:.4f}<extra></extra>",
    },
    // Zero reference line
    {
      x: [0, residuals.length - 1],
      y: [0, 0],
      type: "scatter" as const,
      mode: "lines" as const,
      name: "Zero Line",
      line: { color: "#ef4444", width: 1.5, dash: "dash" },
      showlegend: false,
      hoverinfo: "skip" as const,
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 420,
    margin: { l: 60, r: 20, t: 20, b: 70 },
    xaxis: {
      title: { text: "Observation Index", standoff: 12 },
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
    },
    yaxis: {
      title: { text: "Residual Value", standoff: 8 },
      showgrid: true,
      gridcolor: "rgba(0,0,0,0.05)",
      tickfont: { size: 11 },
      zeroline: false,
    },
    showlegend: true,
    legend: {
      orientation: "h",
      y: -0.28,
      x: 0.5,
      xanchor: "center",
      font: { size: 12 },
    },
    hovermode: "closest",
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
  };

  const config: Partial<Plotly.Config> = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Residual Analysis</CardTitle>
        <CardDescription>
          Residuals plotted against observation index — ideally scattered randomly around zero.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="px-0 pb-0">
          <Plot
            data={data}
            layout={layout}
            config={config}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>

        {/* Statistical test badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isWhiteNoise != null && (
            <Badge variant={isWhiteNoise ? "default" : "destructive"}>
              {isWhiteNoise ? "White Noise" : "Not White Noise"}
            </Badge>
          )}
          {ljungBox && (
            <Badge variant="outline">
              Ljung-Box: {ljungBox.statistic.toFixed(2)} (p={ljungBox.p_value.toFixed(4)})
            </Badge>
          )}
          {jarqueBera && (
            <Badge variant="outline">
              Jarque-Bera: {jarqueBera.statistic.toFixed(2)} (p={jarqueBera.p_value.toFixed(4)})
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
