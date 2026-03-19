"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Copy,
  RotateCcw,
  Download,
  Loader2,
  CheckCircle2,
  Replace,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

import {
  EntitySelector,
  MissingValuesHandler,
  OutlierHandler,
  TimeAggregator,
  DuplicateHandler,
  ValueReplacer,
} from "@/components/preprocessing";

interface Dataset {
  id: string;
  name: string;
  filename: string;
  row_count: number | null;
  column_count: number | null;
  columns?: string[];
  entities: string[];
}

export default function PreprocessingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const datasetIdParam = searchParams.get("dataset");

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(datasetIdParam);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [entityColumn, setEntityColumn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("missing");
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch datasets on mount
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const response = await api.get<{ datasets: Dataset[]; total: number }>("/datasets");
        setDatasets(response.datasets || []);

        // Auto-select dataset from URL param
        if (datasetIdParam) {
          const dataset = response.datasets?.find((d: Dataset) => d.id === datasetIdParam);
          if (dataset) {
            setSelectedDataset(dataset);
          }
        }
      } catch (err: any) {
        toast.error("Failed to load datasets");
      } finally {
        setLoading(false);
      }
    };

    fetchDatasets();
  }, [datasetIdParam]);

  const handleDatasetChange = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    const dataset = datasets.find((d) => d.id === datasetId);
    setSelectedDataset(dataset || null);
    setSelectedEntity(null);
    setEntityColumn(null);

    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set("dataset", datasetId);
    window.history.pushState({}, "", url.toString());
  };

  const handleEntityChange = (entityId: string | null, detectedColumn: string | null) => {
    setSelectedEntity(entityId);
    setEntityColumn(detectedColumn);
  };

  const handleProcessingComplete = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleReset = async () => {
    if (!selectedDatasetId) return;

    setResetting(true);
    try {
      const params = new URLSearchParams();
      if (selectedEntity) params.append("entity_id", selectedEntity);

      await api.post(
        `/preprocessing/${selectedDatasetId}/reset${params.toString() ? `?${params}` : ""}`
      );

      toast.success("Preprocessing reset to original data");
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to reset preprocessing");
    } finally {
      setResetting(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedDatasetId) return;

    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.append("format", "csv");
      if (selectedEntity) params.append("entity_id", selectedEntity);
      if (entityColumn) params.append("entity_column", entityColumn);

      const response = await api.get<Blob>(
        `/preprocessing/${selectedDatasetId}/download?${params}`,
        { responseType: "blob" }
      );

      // Create download link
      const blob = new Blob([response], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preprocessed_${selectedDataset?.name || selectedDatasetId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Download started");
    } catch (err: any) {
      toast.error("Failed to download data");
    } finally {
      setDownloading(false);
    }
  };

  const handleContinueToForecasting = () => {
    if (selectedDatasetId) {
      router.push(`forecast?dataset=${selectedDatasetId}`);
    }
  };

  const numericColumns = selectedDataset?.columns?.filter((col) => {
    // Simple heuristic - exclude common non-numeric columns
    const nonNumeric = ["date", "timestamp", "datetime", "name", "id", "entity", "category", "type"];
    return !nonNumeric.some((n) => col.toLowerCase().includes(n));
  }) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Data Preprocessing</h1>
          <p className="text-muted-foreground">
            Clean and transform your data before forecasting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!selectedDatasetId || resetting}
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!selectedDatasetId || downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download
          </Button>
          <Button size="sm" onClick={handleContinueToForecasting} disabled={!selectedDatasetId}>
            Continue to Forecasting
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Dataset Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Select Dataset
          </CardTitle>
          <CardDescription>Choose a dataset to preprocess</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select
                value={selectedDatasetId || ""}
                onValueChange={handleDatasetChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      <span className="flex items-center gap-2">
                        {dataset.name}
                        <Badge variant="secondary">
                          {dataset.row_count?.toLocaleString() || "?"} rows
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDataset && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">{selectedDataset.name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedDataset.row_count?.toLocaleString() || "?"} rows,{" "}
                  {selectedDataset.column_count || selectedDataset.columns?.length || "?"} columns
                </div>
                {selectedDataset.entities && selectedDataset.entities.length > 0 && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedDataset.entities.length} entities
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedDatasetId && (
        <>
          {/* Entity Selection */}
          <EntitySelector
            key={`entity-${refreshKey}`}
            datasetId={selectedDatasetId}
            selectedEntity={selectedEntity}
            onEntityChange={handleEntityChange}
            entityColumn={entityColumn}
          />

          {/* Preprocessing Tools */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="missing" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Missing Values
              </TabsTrigger>
              <TabsTrigger value="duplicates" className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Duplicates
              </TabsTrigger>
              <TabsTrigger value="outliers" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Outliers
              </TabsTrigger>
              <TabsTrigger value="replace" className="flex items-center gap-2">
                <Replace className="h-4 w-4" />
                Replace Values
              </TabsTrigger>
              <TabsTrigger value="aggregation" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Aggregation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="missing" className="mt-6">
              <MissingValuesHandler
                key={`missing-${refreshKey}`}
                datasetId={selectedDatasetId}
                entityId={selectedEntity}
                entityColumn={entityColumn}
                onProcessingComplete={handleProcessingComplete}
              />
            </TabsContent>

            <TabsContent value="duplicates" className="mt-6">
              <DuplicateHandler
                key={`duplicates-${refreshKey}`}
                datasetId={selectedDatasetId}
                entityId={selectedEntity}
                entityColumn={entityColumn}
                columns={selectedDataset?.columns}
                onProcessingComplete={handleProcessingComplete}
              />
            </TabsContent>

            <TabsContent value="outliers" className="mt-6">
              <OutlierHandler
                key={`outliers-${refreshKey}`}
                datasetId={selectedDatasetId}
                entityId={selectedEntity}
                entityColumn={entityColumn}
                onProcessingComplete={handleProcessingComplete}
              />
            </TabsContent>

            <TabsContent value="replace" className="mt-6">
              <ValueReplacer
                key={`replace-${refreshKey}`}
                datasetId={selectedDatasetId}
                entityId={selectedEntity}
                entityColumn={entityColumn}
                columns={selectedDataset?.columns}
                onProcessingComplete={handleProcessingComplete}
              />
            </TabsContent>

            <TabsContent value="aggregation" className="mt-6">
              <TimeAggregator
                key={`aggregation-${refreshKey}`}
                datasetId={selectedDatasetId}
                entityId={selectedEntity}
                entityColumn={entityColumn}
                numericColumns={numericColumns}
                onProcessingComplete={handleProcessingComplete}
              />
            </TabsContent>
          </Tabs>

          {/* Processing Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Ready for Forecasting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                After preprocessing, your data will be ready for forecasting. You can:
              </p>
              <ul className="list-disc list-inside mt-2 text-muted-foreground space-y-1">
                <li>Download the preprocessed data for external use</li>
                <li>Reset to original data if needed</li>
                <li>Continue directly to forecasting</li>
              </ul>
              <div className="mt-4">
                <Button onClick={handleContinueToForecasting}>
                  Continue to Forecasting
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedDatasetId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Select a dataset above to start preprocessing.
              <br />
              <span className="text-sm">
                You can also{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => router.push("data")}>
                  upload a new dataset
                </Button>{" "}
                first.
              </span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
