"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileJson, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { resultsApi } from "@/lib/api/endpoints";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ExportPanelProps {
  forecastId: string;
  entityId?: string;
  method?: string;
  createdAt?: string;
  completedAt?: string;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1")
    : "http://localhost:8000/api/v1";

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ExportPanel({
  forecastId,
  entityId,
  method,
  createdAt,
  completedAt,
}: ExportPanelProps) {
  const [csvLoading, setCsvLoading] = useState(false);
  const [jsonLoading, setJsonLoading] = useState(false);

  // -- CSV download --
  // The backend returns a streamed file; we open the URL directly so the
  // browser handles the download natively (avoids blob-in-memory for large files).
  const handleDownloadCSV = async () => {
    setCsvLoading(true);
    try {
      // resultsApi.downloadCSV returns the path string (per spec)
      const path = resultsApi.downloadCSV(forecastId);
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      // Fetch as blob so we can attach auth header
      const res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forecast-${forecastId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded successfully");
    } catch (err) {
      toast.error("Download failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCsvLoading(false);
    }
  };

  // -- JSON export report --
  const handleExportReport = async () => {
    setJsonLoading(true);
    try {
      const report = await resultsApi.exportReport(forecastId);

      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forecast-report-${forecastId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setJsonLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Metadata card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Forecast Metadata</CardTitle>
          <CardDescription>Details about this forecast run</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Forecast ID</dt>
              <dd className="mt-0.5 font-mono text-xs break-all">{forecastId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entity</dt>
              <dd className="mt-0.5 font-medium">{entityId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Method</dt>
              <dd className="mt-0.5">
                {method ? (
                  <Badge variant="outline" className="uppercase">
                    {method}
                  </Badge>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-700 font-medium">Completed</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-0.5">{formatDate(createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="mt-0.5">{formatDate(completedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Export actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Export Options</CardTitle>
          <CardDescription>Download forecast results in your preferred format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* CSV */}
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium text-sm">CSV Download</p>
              <p className="text-sm text-muted-foreground">
                Download raw prediction data (date, value, lower bound, upper bound) as a CSV file.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-4 shrink-0"
              onClick={handleDownloadCSV}
              disabled={csvLoading || jsonLoading}
            >
              {csvLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {csvLoading ? "Downloading..." : "Download CSV"}
            </Button>
          </div>

          {/* JSON Report */}
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium text-sm">JSON Report</p>
              <p className="text-sm text-muted-foreground">
                Export a full JSON report including predictions, metrics, model summary, and
                metadata.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-4 shrink-0"
              onClick={handleExportReport}
              disabled={csvLoading || jsonLoading}
            >
              {jsonLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4 mr-2" />
              )}
              {jsonLoading ? "Exporting..." : "Export Report (JSON)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
