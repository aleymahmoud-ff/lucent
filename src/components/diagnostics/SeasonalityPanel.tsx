"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Dynamic import — Plotly cannot run on the server
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface SeasonalityPanelProps {
  seasonalStrength: number;
  trendStrength: number;
  detectedPeriod?: number | null;
  seasonalComponent?: number[] | null;
}

// -------------------------------------------------------
// Strength bar component
// -------------------------------------------------------

function StrengthBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  const percent = Math.round(clamped * 100);

  function getBarColor(v: number): string {
    if (v >= 0.7) return "bg-green-500";
    if (v >= 0.3) return "bg-yellow-500";
    return "bg-red-500";
  }

  function getTextColor(v: number): string {
    if (v >= 0.7) return "text-green-600";
    if (v >= 0.3) return "text-yellow-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("text-sm font-bold tabular-nums", getTextColor(clamped))}>
          {percent}%
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor(clamped))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function SeasonalityPanel({
  seasonalStrength,
  trendStrength,
  detectedPeriod,
  seasonalComponent,
}: SeasonalityPanelProps) {
  const hasSeasonalData = seasonalComponent && seasonalComponent.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Seasonality Analysis</CardTitle>
        <CardDescription>
          Decomposition strength indicators and detected seasonal patterns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strength bars */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StrengthBar label="Seasonal Strength" value={seasonalStrength} />
          <StrengthBar label="Trend Strength" value={trendStrength} />
        </div>

        {/* Detected period badge */}
        <div className="flex flex-wrap items-center gap-2">
          {detectedPeriod != null ? (
            <Badge variant="outline">
              Detected Period: {detectedPeriod} observations
            </Badge>
          ) : (
            <Badge variant="secondary">No period detected</Badge>
          )}
          {seasonalStrength >= 0.7 && (
            <Badge variant="default">Strong Seasonality</Badge>
          )}
          {seasonalStrength < 0.3 && seasonalStrength >= 0 && (
            <Badge variant="destructive">Weak Seasonality</Badge>
          )}
        </div>

        {/* Seasonal component line chart */}
        {hasSeasonalData && (
          <div>
            <Plot
              data={[
                {
                  x: seasonalComponent.map((_, i) => i),
                  y: seasonalComponent,
                  type: "scatter" as const,
                  mode: "lines" as const,
                  name: "Seasonal Component",
                  line: { color: "#8b5cf6", width: 2 },
                  hovertemplate: "<b>Index: %{x}</b><br>Seasonal: %{y:.4f}<extra></extra>",
                },
              ]}
              layout={{
                autosize: true,
                height: 280,
                margin: { l: 50, r: 20, t: 10, b: 50 },
                xaxis: {
                  title: { text: "Observation Index", standoff: 8 },
                  showgrid: true,
                  gridcolor: "rgba(0,0,0,0.05)",
                  tickfont: { size: 11 },
                },
                yaxis: {
                  title: { text: "Seasonal Value", standoff: 8 },
                  showgrid: true,
                  gridcolor: "rgba(0,0,0,0.05)",
                  tickfont: { size: 11 },
                },
                showlegend: false,
                hovermode: "x unified",
                plot_bgcolor: "rgba(0,0,0,0)",
                paper_bgcolor: "rgba(0,0,0,0)",
              }}
              config={{
                responsive: true,
                displayModeBar: false,
                displaylogo: false,
              }}
              style={{ width: "100%" }}
              useResizeHandler
            />
          </div>
        )}

        {/* Empty seasonal component state */}
        {!hasSeasonalData && (
          <p className="text-sm text-muted-foreground">
            No seasonal component data available for charting.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
