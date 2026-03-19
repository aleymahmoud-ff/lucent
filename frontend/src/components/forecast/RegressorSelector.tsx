"use client";

import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, BarChart3 } from "lucide-react";
import { api } from "@/lib/api/client";

interface RegressorInfo {
  column: string;
  type: "binary" | "numeric";
  sample_values: number[];
  valid_ratio: number;
}

interface RegressorSelectorProps {
  datasetId: string | null;
  selectedRegressors: string[];
  onRegressorsChange: (regressors: string[]) => void;
}

export function RegressorSelector({
  datasetId,
  selectedRegressors,
  onRegressorsChange,
}: RegressorSelectorProps) {
  const [regressors, setRegressors] = useState<RegressorInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) {
      setRegressors([]);
      onRegressorsChange([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .get<{ regressors: RegressorInfo[] }>(
        `/preprocessing/${datasetId}/regressors`
      )
      .then((data) => {
        if (!cancelled) {
          setRegressors(data.regressors);
        }
      })
      .catch(() => {
        if (!cancelled) setRegressors([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  if (loading || regressors.length === 0) return null;

  const handleToggle = (column: string) => {
    if (selectedRegressors.includes(column)) {
      onRegressorsChange(selectedRegressors.filter((c) => c !== column));
    } else {
      onRegressorsChange([...selectedRegressors, column]);
    }
  };

  return (
    <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-green-700" />
        <h4 className="text-sm font-semibold text-green-800">
          External Regressors (Prophet)
        </h4>
      </div>

      <p className="text-xs text-green-700">
        Your data contains extra columns that can improve Prophet forecast
        accuracy. Select which to use:
      </p>

      <div className="space-y-2">
        {regressors.map((reg) => (
          <label
            key={reg.column}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-green-100/50 cursor-pointer"
          >
            <Checkbox
              checked={selectedRegressors.includes(reg.column)}
              onCheckedChange={() => handleToggle(reg.column)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{reg.column}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {reg.type}
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">
                e.g. {reg.sample_values.slice(0, 3).join(", ")}
              </span>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-green-700 pt-1">
        <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Select columns that influence your volume (e.g., marketing spend,
          weather, events). Regressors are only used with Prophet.
        </span>
      </div>
    </div>
  );
}
