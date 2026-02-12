"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ForecastResult {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  error?: string;
}

interface ForecastProgressProps {
  isRunning: boolean;
  result: ForecastResult | null;
}

const statusConfig = {
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  running: {
    icon: Loader2,
    label: "Running",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

export function ForecastProgress({ isRunning, result }: ForecastProgressProps) {
  const status = result?.status || (isRunning ? "running" : "pending");
  const config = statusConfig[status];
  const Icon = config.icon;
  const progress = result?.progress || (isRunning ? 0 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Forecast Progress</span>
          <Badge variant="outline" className={cn(config.color, config.bgColor)}>
            <Icon
              className={cn(
                "h-3 w-3 mr-1",
                status === "running" && "animate-spin"
              )}
            />
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Status Steps */}
        <div className="space-y-3">
          <ProgressStep
            step={1}
            label="Loading data"
            completed={progress >= 30}
            active={progress > 0 && progress < 30}
          />
          <ProgressStep
            step={2}
            label="Fitting model"
            completed={progress >= 70}
            active={progress >= 30 && progress < 70}
          />
          <ProgressStep
            step={3}
            label="Generating predictions"
            completed={progress >= 90}
            active={progress >= 70 && progress < 90}
          />
          <ProgressStep
            step={4}
            label="Calculating metrics"
            completed={progress >= 100}
            active={progress >= 90 && progress < 100}
          />
        </div>

        {/* Error Message */}
        {result?.status === "failed" && result.error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive font-medium">Error</p>
            <p className="text-sm text-destructive/80 mt-1">{result.error}</p>
          </div>
        )}

        {/* Success Message */}
        {result?.status === "completed" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 font-medium">
              Forecast completed successfully!
            </p>
            <p className="text-sm text-green-600 mt-1">
              View the results in the Results tab.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressStep({
  step,
  label,
  completed,
  active,
}: {
  step: number;
  label: string;
  completed: boolean;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
          completed
            ? "bg-green-600 text-white"
            : active
            ? "bg-blue-600 text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {completed ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : active ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          step
        )}
      </div>
      <span
        className={cn(
          "text-sm",
          completed ? "text-foreground" : active ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );
}
