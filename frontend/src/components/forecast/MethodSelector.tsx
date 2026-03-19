"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Waves, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface MethodSelectorProps {
  selectedMethod: "arima" | "ets" | "prophet";
  onSelect: (method: "arima" | "ets" | "prophet") => void;
}

const methods = [
  {
    id: "arima" as const,
    name: "ARIMA",
    description: "Best for data with trends and autocorrelation. Handles non-stationary series.",
    icon: TrendingUp,
    tags: ["Trend", "Auto-correlation"],
  },
  {
    id: "ets" as const,
    name: "ETS",
    description: "Best for data with clear level, trend, and seasonal patterns.",
    icon: Waves,
    tags: ["Seasonality", "Smoothing"],
  },
  {
    id: "prophet" as const,
    name: "Prophet",
    description: "Best for business data with holidays, missing data, and strong seasonality.",
    icon: Calendar,
    tags: ["Business", "Holidays", "Flexible"],
  },
];

export function MethodSelector({ selectedMethod, onSelect }: MethodSelectorProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Forecasting Method</CardTitle>
        <CardDescription>Select the algorithm for your forecast</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {methods.map((method) => {
          const Icon = method.icon;
          const isSelected = selectedMethod === method.id;

          return (
            <div
              key={method.id}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => onSelect(method.id)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{method.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {method.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {method.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
