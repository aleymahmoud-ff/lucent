"use client";

import { useState } from "react";
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
import { Loader2, Calendar } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

type AggregationFrequency = "D" | "W" | "M" | "Q" | "Y";
type AggregationMethod = "sum" | "mean" | "median" | "min" | "max" | "first" | "last";

interface TimeAggregatorProps {
  datasetId: string;
  entityId: string | null;
  entityColumn: string | null;
  dateColumn?: string;
  numericColumns?: string[];
  onProcessingComplete?: () => void;
}

const frequencyOptions: { value: AggregationFrequency; label: string; description: string }[] = [
  { value: "D", label: "Daily", description: "Aggregate to daily frequency" },
  { value: "W", label: "Weekly", description: "Aggregate to weekly frequency" },
  { value: "M", label: "Monthly", description: "Aggregate to monthly frequency" },
  { value: "Q", label: "Quarterly", description: "Aggregate to quarterly frequency" },
  { value: "Y", label: "Yearly", description: "Aggregate to yearly frequency" },
];

const methodOptions: { value: AggregationMethod; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "mean", label: "Mean (Average)" },
  { value: "median", label: "Median" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "first", label: "First Value" },
  { value: "last", label: "Last Value" },
];

export function TimeAggregator({
  datasetId,
  entityId,
  entityColumn,
  dateColumn: initialDateColumn,
  numericColumns: initialNumericColumns,
  onProcessingComplete,
}: TimeAggregatorProps) {
  const [processing, setProcessing] = useState(false);
  const [frequency, setFrequency] = useState<AggregationFrequency>("M");
  const [defaultMethod, setDefaultMethod] = useState<AggregationMethod>("sum");
  const [dateColumn, setDateColumn] = useState<string>(initialDateColumn || "date");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(initialNumericColumns || []);
  const [columnMethods, setColumnMethods] = useState<Record<string, AggregationMethod>>({});

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
    );
  };

  const handleColumnMethodChange = (column: string, method: AggregationMethod) => {
    setColumnMethods((prev) => ({ ...prev, [column]: method }));
  };

  const handleApply = async () => {
    if (!dateColumn) {
      toast.error("Please specify the date column");
      return;
    }

    setProcessing(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.append("entity_id", entityId);
      if (entityColumn) params.append("entity_column", entityColumn);

      // Build column_methods object
      const columnMethodsPayload: Record<string, string> = {};
      selectedColumns.forEach((col) => {
        columnMethodsPayload[col] = columnMethods[col] || defaultMethod;
      });

      await api.post(
        `/preprocessing/${datasetId}/aggregate${params.toString() ? `?${params}` : ""}`,
        {
          frequency,
          date_column: dateColumn,
          agg_method: defaultMethod,
          column_methods: Object.keys(columnMethodsPayload).length > 0 ? columnMethodsPayload : undefined,
        }
      );

      toast.success("Time aggregation applied successfully");
      if (onProcessingComplete) {
        onProcessingComplete();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to apply time aggregation");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Time Aggregation
        </CardTitle>
        <CardDescription>
          Aggregate time series data to different frequencies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Frequency Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Target Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as AggregationFrequency)}>
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((option) => (
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
            <Label>Default Method</Label>
            <Select value={defaultMethod} onValueChange={(v) => setDefaultMethod(v as AggregationMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {methodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date Column */}
        <div className="space-y-2">
          <Label>Date Column</Label>
          <Select value={dateColumn} onValueChange={setDateColumn}>
            <SelectTrigger>
              <SelectValue placeholder="Select date column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">date</SelectItem>
              <SelectItem value="timestamp">timestamp</SelectItem>
              <SelectItem value="datetime">datetime</SelectItem>
              <SelectItem value="Date">Date</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The column containing date/time values for grouping
          </p>
        </div>

        {/* Column-specific methods (optional) */}
        {initialNumericColumns && initialNumericColumns.length > 0 && (
          <div className="space-y-2">
            <Label>Column-Specific Methods (Optional)</Label>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
              {initialNumericColumns.map((col) => (
                <div
                  key={col}
                  className="flex items-center justify-between p-2 hover:bg-muted rounded"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedColumns.includes(col)}
                      onCheckedChange={() => handleColumnToggle(col)}
                    />
                    <span className="font-medium">{col}</span>
                  </div>
                  {selectedColumns.includes(col) && (
                    <Select
                      value={columnMethods[col] || defaultMethod}
                      onValueChange={(v) => handleColumnMethodChange(col, v as AggregationMethod)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {methodOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select columns to use custom aggregation methods. Unselected columns will use the default method.
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="p-3 bg-muted rounded-md text-sm">
          <p className="font-medium">What this does:</p>
          <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
            <li>Groups data by the selected time frequency</li>
            <li>Aggregates numeric columns using the specified method</li>
            <li>Preserves entity groupings if an entity is selected</li>
          </ul>
        </div>

        {/* Apply Button */}
        <Button onClick={handleApply} disabled={processing || !dateColumn} className="w-full">
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Aggregating...
            </>
          ) : (
            `Aggregate to ${frequencyOptions.find((f) => f.value === frequency)?.label || frequency}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
