"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Target, TrendingUp, Percent, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForecastMetrics } from "@/types";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function getColorClass(metric: "mae" | "rmse" | "mape" | "r2", value: number): string {
  // Color thresholds — lower is better for error metrics, higher is better for R²
  if (metric === "r2") {
    if (value >= 0.9) return "text-green-600";
    if (value >= 0.7) return "text-yellow-600";
    return "text-red-600";
  }
  if (metric === "mape") {
    if (value <= 5) return "text-green-600";
    if (value <= 15) return "text-yellow-600";
    return "text-red-600";
  }
  // MAE / RMSE — relative interpretation: we use a simple bucket based on MAPE-like scale
  // Since we don't know scale, we colour neutral by default (grey)
  return "text-foreground";
}

function getDotClass(metric: "mae" | "rmse" | "mape" | "r2", value: number): string {
  if (metric === "r2") {
    if (value >= 0.9) return "bg-green-500";
    if (value >= 0.7) return "bg-yellow-500";
    return "bg-red-500";
  }
  if (metric === "mape") {
    if (value <= 5) return "bg-green-500";
    if (value <= 15) return "bg-yellow-500";
    return "bg-red-500";
  }
  return "bg-blue-500";
}

function formatValue(value: number, isPercent = false, decimals = 4): string {
  if (!Number.isFinite(value)) return "N/A";
  if (isPercent) return `${value.toFixed(2)}%`;
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 2 });
}

// -------------------------------------------------------
// Single metric card
// -------------------------------------------------------

interface MetricCardProps {
  label: string;
  fullName: string;
  value: string;
  icon: React.ElementType;
  colorClass: string;
  dotClass: string;
}

function MetricCard({ label, fullName, value, icon: Icon, colorClass, dotClass }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
          </div>
          <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        </div>
        <div className={cn("text-2xl font-bold tabular-nums", colorClass)}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{fullName}</p>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------
// Public component
// -------------------------------------------------------

interface MetricsCardsProps {
  metrics: ForecastMetrics;
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      key: "mae" as const,
      label: "MAE",
      fullName: "Mean Absolute Error",
      icon: Target,
      value: formatValue(metrics.mae),
    },
    {
      key: "rmse" as const,
      label: "RMSE",
      fullName: "Root Mean Square Error",
      icon: TrendingUp,
      value: formatValue(metrics.rmse),
    },
    {
      key: "mape" as const,
      label: "MAPE",
      fullName: "Mean Absolute Percentage Error",
      icon: Percent,
      value: formatValue(metrics.mape, true),
    },
    ...(metrics.r2 != null
      ? [
          {
            key: "r2" as const,
            label: "R\u00B2",
            fullName: "Coefficient of Determination",
            icon: BarChart3,
            value: formatValue(metrics.r2, false, 4),
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.key}
          label={card.label}
          fullName={card.fullName}
          value={card.value}
          icon={card.icon}
          colorClass={getColorClass(card.key, card.key === "mape" ? metrics.mape : card.key === "r2" ? (metrics.r2 ?? 0) : 0)}
          dotClass={getDotClass(card.key, card.key === "mape" ? metrics.mape : card.key === "r2" ? (metrics.r2 ?? 0) : 0)}
        />
      ))}
    </div>
  );
}
