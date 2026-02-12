"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

type OutlierMethod = "iqr" | "zscore" | "percentile";
type OutlierAction = "remove" | "cap" | "replace_mean" | "replace_median" | "flag";

interface ColumnOutlierInfo {
  column: string;
  outlier_count: number;
  outlier_percentage: number;
  min: number;
  max: number;
  lower_bound: number;
  upper_bound: number;
}

interface OutlierHandlerProps {
  datasetId: string;
  entityId: string | null;
  entityColumn: string | null;
  onProcessingComplete?: () => void;
}

const methodOptions: { value: OutlierMethod; label: string; description: string; defaultThreshold: number }[] = [
  { value: "iqr", label: "IQR Method", description: "Interquartile Range (Q1 - 1.5*IQR to Q3 + 1.5*IQR)", defaultThreshold: 1.5 },
  { value: "zscore", label: "Z-Score", description: "Standard deviations from mean", defaultThreshold: 3 },
  { value: "percentile", label: "Percentile", description: "Values outside percentile bounds", defaultThreshold: 95 },
];

const actionOptions: { value: OutlierAction; label: string; description: string }[] = [
  { value: "remove", label: "Remove Rows", description: "Delete rows containing outliers" },
  { value: "cap", label: "Cap Values", description: "Replace outliers with boundary values" },
  { value: "replace_mean", label: "Replace with Mean", description: "Replace outliers with column mean" },
  { value: "replace_median", label: "Replace with Median", description: "Replace outliers with column median" },
  { value: "flag", label: "Flag Only", description: "Add a column marking outliers (no data change)" },
];

export function OutlierHandler({
  datasetId,
  entityId,
  entityColumn,
  onProcessingComplete,
}: OutlierHandlerProps) {
  const [analysis, setAnalysis] = useState<{
    total_rows: number;
    total_outliers: number;
    columns: ColumnOutlierInfo[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<OutlierMethod>("iqr");
  const [threshold, setThreshold] = useState<number>(1.5);
  const [selectedAction, setSelectedAction] = useState<OutlierAction>("cap");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleMethodChange = (method: OutlierMethod) => {
    setSelectedMethod(method);
    const methodConfig = methodOptions.find((m) => m.value === method);
    if (methodConfig) {
      setThreshold(methodConfig.defaultThreshold);
    }
    setAnalysis(null);
  };

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    setAnalysis(null);

    try {
      const params = new URLSearchParams();
      params.append("method", selectedMethod);
      params.append("threshold", threshold.toString());
      if (entityId) params.append("entity_id", entityId);
      if (entityColumn) params.append("entity_column", entityColumn);

      const response = await api.get<{
        total_rows: number;
        total_outliers: number;
        columns: ColumnOutlierInfo[];
      }>(
        `/preprocessing/${datasetId}/outliers?${params}`
      );

      setAnalysis(response);
      // Auto-select columns with outliers
      const columnsWithOutliers = (response.columns || [])
        .filter((c: ColumnOutlierInfo) => c.outlier_count > 0)
        .map((c: ColumnOutlierInfo) => c.column);
      setSelectedColumns(columnsWithOutliers);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to detect outliers");
    } finally {
      setDetecting(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
    );
  };

  const handleApply = async () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column");
      return;
    }

    setProcessing(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.append("entity_id", entityId);
      if (entityColumn) params.append("entity_column", entityColumn);

      await api.post(
        `/preprocessing/${datasetId}/outliers${params.toString() ? `?${params}` : ""}`,
        {
          method: selectedMethod,
          threshold: threshold,
          action: selectedAction,
          columns: selectedColumns,
        }
      );

      toast.success("Outliers handled successfully");
      if (onProcessingComplete) {
        onProcessingComplete();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to handle outliers");
    } finally {
      setProcessing(false);
    }
  };

  const columnsWithOutliers = analysis?.columns.filter((c) => c.outlier_count > 0) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Outlier Detection
        </CardTitle>
        <CardDescription>Detect and handle outliers in numeric columns</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Detection Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Detection Method</Label>
            <Select value={selectedMethod} onValueChange={(v) => handleMethodChange(v as OutlierMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {methodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Threshold</Label>
            <Input
              type="number"
              step="0.1"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              {selectedMethod === "iqr" && "IQR multiplier (1.5 = standard, 3 = extreme)"}
              {selectedMethod === "zscore" && "Number of standard deviations"}
              {selectedMethod === "percentile" && "Percentile cutoff (e.g., 95 = 5th and 95th)"}
            </p>
          </div>
        </div>

        {/* Detect Button */}
        <Button onClick={handleDetect} disabled={detecting} variant="outline" className="w-full">
          {detecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Detecting...
            </>
          ) : (
            "Detect Outliers"
          )}
        </Button>

        {error && <div className="text-center py-4 text-destructive">{error}</div>}

        {analysis && columnsWithOutliers.length === 0 && (
          <div className="flex items-center justify-center py-8 text-green-600">
            <CheckCircle2 className="h-6 w-6 mr-2" />
            <span>No outliers detected with current settings</span>
          </div>
        )}

        {analysis && columnsWithOutliers.length > 0 && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Total Rows</div>
                <div className="text-xl font-semibold">{(analysis.total_rows ?? 0).toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Total Outliers</div>
                <div className="text-xl font-semibold">{(analysis.total_outliers ?? 0).toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Affected Columns</div>
                <div className="text-xl font-semibold">{columnsWithOutliers.length}</div>
              </div>
            </div>

            {/* Action Selection */}
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={selectedAction} onValueChange={(v) => setSelectedAction(v as OutlierAction)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Column Selection */}
            <div className="space-y-2">
              <Label>Columns with Outliers</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                {columnsWithOutliers.map((col) => (
                  <div
                    key={col.column}
                    className="flex items-center justify-between p-2 hover:bg-muted rounded"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedColumns.includes(col.column)}
                        onCheckedChange={() => handleColumnToggle(col.column)}
                      />
                      <span className="font-medium">{col.column}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="destructive">
                        {col.outlier_count ?? 0} ({(col.outlier_percentage ?? 0).toFixed(1)}%)
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Bounds: [{(col.lower_bound ?? 0).toFixed(2)}, {(col.upper_bound ?? 0).toFixed(2)}]
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <Button
              onClick={handleApply}
              disabled={processing || selectedColumns.length === 0}
              className="w-full"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Apply to ${selectedColumns.length} Column${selectedColumns.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
