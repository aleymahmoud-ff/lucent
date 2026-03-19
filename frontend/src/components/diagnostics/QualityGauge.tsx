"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface QualityScores {
  accuracy: number;
  stability: number;
  reliability: number;
  coverage: number;
}

interface QualityGaugeProps {
  quality: QualityScores;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function getColor(value: number): string {
  if (value >= 80) return "#22c55e"; // green-500
  if (value >= 50) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function getColorClass(value: number): string {
  if (value >= 80) return "text-green-600";
  if (value >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getLabelForKey(key: string): string {
  switch (key) {
    case "accuracy":
      return "Accuracy";
    case "stability":
      return "Stability";
    case "reliability":
      return "Reliability";
    case "coverage":
      return "Coverage";
    default:
      return key;
  }
}

function getDescriptionForKey(key: string): string {
  switch (key) {
    case "accuracy":
      return "Prediction precision";
    case "stability":
      return "Forecast consistency";
    case "reliability":
      return "Statistical confidence";
    case "coverage":
      return "Interval coverage";
    default:
      return "";
  }
}

// -------------------------------------------------------
// SVG circular progress
// -------------------------------------------------------

interface CircularGaugeProps {
  value: number;
  label: string;
  description: string;
  size?: number;
}

function CircularGauge({ value, label, description, size = 120 }: CircularGaugeProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const color = getColor(clamped);
  const colorClass = getColorClass(clamped);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease-in-out" }}
          />
        </svg>
        {/* Score text centred inside the circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-2xl font-bold tabular-nums", colorClass)}>
            {Math.round(clamped)}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Public component
// -------------------------------------------------------

export function QualityGauge({ quality }: QualityGaugeProps) {
  const keys = ["accuracy", "stability", "reliability", "coverage"] as const;

  const overallScore = Math.round(
    keys.reduce((sum, k) => sum + (quality[k] ?? 0), 0) / keys.length
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Quality Indicators</CardTitle>
        <CardDescription>
          Overall quality score: {overallScore}/100
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {keys.map((key) => (
            <CircularGauge
              key={key}
              value={quality[key] ?? 0}
              label={getLabelForKey(key)}
              description={getDescriptionForKey(key)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
