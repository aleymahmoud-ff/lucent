"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  FileSpreadsheet,
  Hash,
  AlertTriangle,
  Database,
  Layers,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api/client";

interface DataSummaryProps {
  datasetId: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  missing_count: number;
  unique_count: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
}

interface MissingValueInfo {
  column: string;
  count: number;
  percentage: number;
}

interface SummaryData {
  total_rows: number;
  total_columns: number;
  missing_values: number;
  missing_percentage: number;
  date_range: {
    start: string | null;
    end: string | null;
  };
  entity_count: number;
  columns: ColumnInfo[];
  missing_by_column: MissingValueInfo[];
  memory_usage_mb: number;
}

export function DataSummary({ datasetId }: DataSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, [datasetId]);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<SummaryData>(`/datasets/${datasetId}/summary`);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Loading summary...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            <p className="font-medium">Error loading summary</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const stats = [
    {
      label: "Total Rows",
      value: summary.total_rows.toLocaleString(),
      icon: Database,
      color: "text-blue-600",
    },
    {
      label: "Total Columns",
      value: summary.total_columns.toString(),
      icon: FileSpreadsheet,
      color: "text-green-600",
    },
    {
      label: "Entities",
      value: summary.entity_count > 0 ? summary.entity_count.toString() : "N/A",
      icon: Layers,
      color: "text-purple-600",
    },
    {
      label: "Missing Values",
      value: `${summary.missing_percentage.toFixed(1)}%`,
      icon: AlertTriangle,
      color: summary.missing_percentage > 5 ? "text-orange-600" : "text-gray-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 bg-muted`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Date range */}
      {summary.date_range.start && summary.date_range.end && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Start</p>
                <p className="font-medium">{summary.date_range.start}</p>
              </div>
              <div className="h-px flex-1 bg-border" />
              <div className="text-right">
                <p className="text-sm text-muted-foreground">End</p>
                <p className="font-medium">{summary.date_range.end}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Column details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Column Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Column</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-right py-2 px-3 font-medium">Unique</th>
                  <th className="text-right py-2 px-3 font-medium">Missing</th>
                  <th className="text-right py-2 px-3 font-medium">Min</th>
                  <th className="text-right py-2 px-3 font-medium">Max</th>
                  <th className="text-right py-2 px-3 font-medium">Mean</th>
                </tr>
              </thead>
              <tbody>
                {summary.columns.map((col) => (
                  <tr key={col.name} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{col.name}</td>
                    <td className="py-2 px-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{col.type}</span>
                    </td>
                    <td className="py-2 px-3 text-right">{col.unique_count.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">
                      {col.missing_count > 0 ? (
                        <span className="text-orange-600">
                          {col.missing_count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {col.min !== undefined && col.min !== null
                        ? col.min.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {col.max !== undefined && col.max !== null
                        ? col.max.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {col.mean !== undefined && col.mean !== null
                        ? col.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Missing values by column */}
      {summary.missing_by_column.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Missing Values by Column
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.missing_by_column.map((item) => (
                <div key={item.column} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.column}</span>
                    <span className="text-muted-foreground">
                      {item.count.toLocaleString()} ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory usage */}
      <div className="text-center text-sm text-muted-foreground">
        Memory usage: {summary.memory_usage_mb.toFixed(2)} MB
      </div>
    </div>
  );
}
