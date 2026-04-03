"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

type MissingValueMethod =
  | "drop"
  | "fill_zero"
  | "fill_mean"
  | "fill_median"
  | "fill_mode"
  | "forward_fill"
  | "backward_fill"
  | "linear_interpolate"
  | "spline_interpolate";

interface ColumnMissingInfo {
  column: string;
  missing_count: number;
  missing_percentage: number;
  dtype: string;
}

interface MissingValuesHandlerProps {
  datasetId: string;
  entityId: string | null;
  entityColumn: string | null;
  onProcessingComplete?: () => void;
}

const methodOptions: { value: MissingValueMethod; label: string; description: string }[] = [
  { value: "drop", label: "Drop Rows", description: "Remove rows with missing values" },
  { value: "fill_zero", label: "Fill with Zero", description: "Replace missing values with 0" },
  { value: "fill_mean", label: "Fill with Mean", description: "Replace with column mean" },
  { value: "fill_median", label: "Fill with Median", description: "Replace with column median" },
  { value: "fill_mode", label: "Fill with Mode", description: "Replace with most frequent value" },
  { value: "forward_fill", label: "Forward Fill", description: "Use previous valid value" },
  { value: "backward_fill", label: "Backward Fill", description: "Use next valid value" },
  { value: "linear_interpolate", label: "Linear Interpolation", description: "Linear interpolation between values" },
  { value: "spline_interpolate", label: "Spline Interpolation", description: "Spline-based interpolation" },
];

export function MissingValuesHandler({
  datasetId,
  entityId,
  entityColumn,
  onProcessingComplete,
}: MissingValuesHandlerProps) {
  const [analysis, setAnalysis] = useState<{
    total_rows: number;
    total_missing: number;
    columns: ColumnMissingInfo[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<MissingValueMethod>("forward_fill");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (entityId) params.append("entity_id", entityId);
        if (entityColumn) params.append("entity_column", entityColumn);

        const response = await api.get<{
          total_rows: number;
          total_missing: number;
          columns: ColumnMissingInfo[];
        }>(
          `/preprocessing/${datasetId}/missing${params.toString() ? `?${params}` : ""}`
        );

        setAnalysis(response);
        // Auto-select columns with missing values
        const columnsWithMissing = (response.columns || [])
          .filter((c: ColumnMissingInfo) => c.missing_count > 0)
          .map((c: ColumnMissingInfo) => c.column);
        setSelectedColumns(columnsWithMissing);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Failed to analyze missing values");
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchAnalysis();
    }
  }, [datasetId, entityId, entityColumn]);

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
    );
  };

  const handleSelectAll = () => {
    if (analysis) {
      const allColumns = analysis.columns
        .filter((c) => c.missing_count > 0)
        .map((c) => c.column);
      setSelectedColumns(allColumns);
    }
  };

  const handleSelectNone = () => {
    setSelectedColumns([]);
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
        `/preprocessing/${datasetId}/missing${params.toString() ? `?${params}` : ""}`,
        {
          method: selectedMethod,
          columns: selectedColumns,
        }
      );

      toast.success("Missing values handled successfully");
      if (onProcessingComplete) {
        onProcessingComplete();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to handle missing values");
    } finally {
      setProcessing(false);
    }
  };

  const totalMissingPercentage = analysis
    ? (analysis.total_missing / (analysis.total_rows * analysis.columns.length)) * 100
    : 0;

  const columnsWithMissing = analysis?.columns.filter((c) => c.missing_count > 0) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Missing Values
        </CardTitle>
        <CardDescription>Detect and handle missing values in your data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Analyzing missing values...</span>
          </div>
        ) : error ? (
          <div className="text-center py-4 text-destructive">{error}</div>
        ) : analysis && columnsWithMissing.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-green-600">
            <CheckCircle2 className="h-6 w-6 mr-2" />
            <span>No missing values found in the dataset</span>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Total Rows</div>
                <div className="text-xl font-semibold">{analysis?.total_rows.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Missing Values</div>
                <div className="text-xl font-semibold">{analysis?.total_missing.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Affected Columns</div>
                <div className="text-xl font-semibold">{columnsWithMissing.length}</div>
              </div>
            </div>

            {/* Method Selection */}
            <div className="space-y-2">
              <Label>Handling Method</Label>
              <Select value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as MissingValueMethod)}>
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

            {/* Column Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Columns with Missing Values</Label>
                <div className="space-x-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSelectNone}>
                    Select None
                  </Button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                {columnsWithMissing.map((col) => (
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
                      <Badge variant="outline">{col.dtype}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Progress value={col.missing_percentage} className="h-2" />
                      </div>
                      <span className="text-sm text-muted-foreground w-16 text-right">
                        {col.missing_percentage.toFixed(1)}%
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
