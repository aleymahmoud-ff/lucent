"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, RefreshCw, Settings2, Wand2, Loader2, CheckCircle2, LineChart, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useForecastStore } from "@/stores/forecastStore";
import type { ForecastResult as StoreForecastResult } from "@/types";

import {
  DatasetSelector,
  EntitySelector,
  ALL_ENTITIES_VALUE,
  MethodSelector,
  ForecastSettings,
  ARIMASettings,
  ETSSettings,
  ProphetSettings,
  RegressorSelector,
  ForecastProgress,
  ForecastResults,
  CrossValidationSettings,
} from "@/components/forecast";
import type { Entity } from "@/components/forecast";
import { BatchForecastResults } from "@/components/forecast/BatchForecastResults";

interface Dataset {
  id: string;
  name: string;
  filename: string;
  row_count: number;
  column_count: number;
  entities?: string[];
  date_range?: { start: string; end: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MethodSettings = Record<string, any>;

interface CrossValidationConfig {
  enabled: boolean;
  folds: number;
  method: "rolling" | "expanding";
  initialTrainSize?: number;
}

interface ForecastConfig {
  method: "arima" | "ets" | "prophet";
  horizon: number;
  frequency: "daily" | "weekly" | "monthly";
  confidenceLevel: number;
  methodSettings: MethodSettings;
  crossValidation: CrossValidationConfig;
}

interface ForecastResult {
  id: string;
  dataset_id: string;
  entity_id: string;
  method: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  predictions: Array<{
    date: string;
    value: number;
    lower_bound: number;
    upper_bound: number;
  }>;
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
    mse?: number;
    r2?: number;
    aic?: number;
    bic?: number;
  };
  model_summary: {
    method: string;
    parameters: Record<string, unknown>;
    coefficients?: Record<string, number>;
    diagnostics?: Record<string, unknown>;
    regressors_used?: string[];
  };
  created_at: string;
  completed_at?: string;
  error?: string;
}

interface BatchForecastResult {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  status: string;
  results: ForecastResult[];
}

const defaultCrossValidation: CrossValidationConfig = {
  enabled: false,
  folds: 5,
  method: "rolling",
  initialTrainSize: 70,
};

const defaultConfig: ForecastConfig = {
  method: "arima",
  horizon: 30,
  frequency: "daily",
  confidenceLevel: 0.95,
  methodSettings: { auto: true },
  crossValidation: defaultCrossValidation,
};

export default function ForecastPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const tenant = params.tenant as string;
  const datasetIdFromUrl = searchParams.get("dataset");

  // State
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [forecastConfig, setForecastConfig] = useState<ForecastConfig>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchForecastResult | null>(null);
  const [activeTab, setActiveTab] = useState("configure");
  const [selectedRegressors, setSelectedRegressors] = useState<string[]>([]);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBatchMode = selectedEntity === ALL_ENTITIES_VALUE;

  // Cleanup polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Handlers
  const handleDatasetSelect = useCallback((dataset: Dataset | null) => {
    setSelectedDataset(dataset);
    setSelectedEntity(null);
    setForecastResult(null);
    setBatchResult(null);
    setSelectedRegressors([]);
  }, []);

  const handleEntitySelect = useCallback((entityId: string | null) => {
    setSelectedEntity(entityId);
    setForecastResult(null);
    setBatchResult(null);
  }, []);

  const handleEntitiesLoaded = useCallback((entities: Entity[]) => {
    setAllEntities(entities);
  }, []);

  const handleMethodSelect = useCallback((method: "arima" | "ets" | "prophet") => {
    setForecastConfig((prev) => ({
      ...prev,
      method,
      methodSettings: { auto: true },
    }));
  }, []);

  const handleConfigChange = useCallback((config: Partial<ForecastConfig>) => {
    setForecastConfig((prev) => ({ ...prev, ...config }));
  }, []);

  const handleCrossValidationChange = useCallback((cv: CrossValidationConfig) => {
    setForecastConfig((prev) => ({ ...prev, crossValidation: cv }));
  }, []);

  const handleReset = useCallback(() => {
    setForecastResult(null);
    setBatchResult(null);
    setActiveTab("configure");
  }, []);

  // Auto-detect parameters from the backend
  const handleAutoDetectParams = useCallback(async () => {
    if (!selectedDataset || !selectedEntity) {
      toast.error("Select a dataset and entity first");
      return;
    }

    // For auto-detect, use first entity if "All" is selected
    const entityForDetection = isBatchMode
      ? allEntities[0]?.name
      : selectedEntity;

    if (!entityForDetection) return;

    setIsAutoDetecting(true);
    try {
      const result = await api.post<MethodSettings>(
        `/forecast/auto-params/${forecastConfig.method}?dataset_id=${selectedDataset.id}&entity_id=${entityForDetection}`
      );
      setForecastConfig((prev) => ({
        ...prev,
        methodSettings: { ...result, auto: false },
      }));
      toast.success("Parameters auto-detected", {
        description: `Optimal parameters found for ${forecastConfig.method.toUpperCase()}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Auto-detection failed";
      toast.error("Could not auto-detect parameters", { description: msg });
    } finally {
      setIsAutoDetecting(false);
    }
  }, [selectedDataset, selectedEntity, forecastConfig.method, isBatchMode, allEntities]);

  // Status update callback from ForecastProgress polling
  const handleStatusUpdate = useCallback(
    (updated: ForecastResult) => {
      setForecastResult(updated);
      if (updated.status === "completed") {
        setIsRunning(false);
        setActiveTab("results");
        useForecastStore.getState().setForecastResults({ id: updated.id } as StoreForecastResult);
        toast.success("Forecast completed!", {
          description: `${updated.predictions.length} periods forecasted using ${updated.model_summary?.method}`,
        });
      } else if (updated.status === "failed") {
        setIsRunning(false);
        toast.error("Forecast failed", {
          description: updated.error || "An unknown error occurred",
        });
      }
    },
    []
  );

  const handleRunForecast = useCallback(async () => {
    if (!selectedDataset || !selectedEntity) {
      toast.error("Please select a dataset and entity first");
      return;
    }

    setIsRunning(true);
    setActiveTab("progress");

    // Build common payload parts
    const frequencyMap: Record<string, string> = { daily: "D", weekly: "W", monthly: "M" };
    const methodSettingsKey =
      forecastConfig.method === "arima" ? "arima_settings"
      : forecastConfig.method === "ets" ? "ets_settings"
      : "prophet_settings";

    if (isBatchMode) {
      // Batch forecast for all entities — starts in background, then poll
      setBatchResult(null);
      setForecastResult(null);

      try {
        const entityNames = allEntities.map((e) => e.name);
        const payload: Record<string, unknown> = {
          dataset_id: selectedDataset.id,
          entity_ids: entityNames,
          method: forecastConfig.method,
          horizon: forecastConfig.horizon,
          frequency: frequencyMap[forecastConfig.frequency],
          confidence_level: forecastConfig.confidenceLevel,
          [methodSettingsKey]: forecastConfig.methodSettings,
          ...(selectedRegressors.length > 0 && { regressor_columns: selectedRegressors }),
        };

        // POST returns immediately with batch_id + status=running
        const initial = await api.post<BatchForecastResult>("/forecast/batch", payload);
        setBatchResult(initial);

        // Poll for updates every 3 seconds
        const batchId = initial.batch_id;
        const poll = async () => {
          try {
            const updated = await api.get<BatchForecastResult>(`/forecast/batch/${batchId}`);
            setBatchResult(updated);

            if (updated.status === "running") {
              // Still processing — keep polling
              pollTimerRef.current = setTimeout(poll, 3000);
            } else {
              // Done (completed or failed)
              setIsRunning(false);
              if (updated.completed > 0) {
                setActiveTab("results");
                // Persist first completed result to store so Results page can pick it up
                const firstCompleted = updated.results.find((r: ForecastResult) => r.status === "completed");
                if (firstCompleted) {
                  useForecastStore.getState().setForecastResults({ id: firstCompleted.id } as StoreForecastResult);
                }
                toast.success("Batch forecast completed!", {
                  description: `${updated.completed}/${updated.total} entities forecasted successfully`,
                });
              } else {
                toast.error("Batch forecast failed", {
                  description: `${updated.failed}/${updated.total} entities failed`,
                });
              }
            }
          } catch {
            // Polling error — stop polling
            pollTimerRef.current = null;
            setIsRunning(false);
          }
        };
        pollTimerRef.current = setTimeout(poll, 3000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An error occurred";
        toast.error("Error starting batch forecast", { description: errorMessage });
        setIsRunning(false);
      }
    } else {
      // Single entity forecast
      setForecastResult({
        id: "",
        dataset_id: selectedDataset.id,
        entity_id: selectedEntity,
        method: forecastConfig.method,
        status: "running",
        progress: 0,
        predictions: [],
        metrics: { mae: 0, rmse: 0, mape: 0 },
        model_summary: { method: forecastConfig.method, parameters: {} },
        created_at: new Date().toISOString(),
      });
      setBatchResult(null);

      try {
        const payload: Record<string, unknown> = {
          dataset_id: selectedDataset.id,
          entity_id: selectedEntity,
          method: forecastConfig.method,
          horizon: forecastConfig.horizon,
          frequency: frequencyMap[forecastConfig.frequency],
          confidence_level: forecastConfig.confidenceLevel,
          [methodSettingsKey]: forecastConfig.methodSettings,
          ...(selectedRegressors.length > 0 && { regressor_columns: selectedRegressors }),
        };

        // Cross validation
        if (forecastConfig.crossValidation.enabled) {
          payload.cross_validation = {
            enabled: true,
            folds: forecastConfig.crossValidation.folds,
            method: forecastConfig.crossValidation.method,
            ...(forecastConfig.crossValidation.initialTrainSize !== undefined && {
              initial_train_size: forecastConfig.crossValidation.initialTrainSize / 100,
            }),
          };
        } else {
          payload.cross_validation = { enabled: false, folds: 5, method: "rolling" };
        }

        const result = await api.post<ForecastResult>("/forecast/run", payload);

        setForecastResult(result);

        if (result.status === "completed") {
          setIsRunning(false);
          setActiveTab("results");
          // Persist to store so Results page can pick it up
          useForecastStore.getState().setForecastResults({ id: result.id } as StoreForecastResult);
          toast.success("Forecast completed successfully!", {
            description: `${result.predictions.length} periods forecasted using ${result.model_summary.method}`,
          });
        } else if (result.status === "failed") {
          setIsRunning(false);
          toast.error("Forecast failed", {
            description: result.error || "An unknown error occurred",
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An error occurred";
        toast.error("Error running forecast", { description: errorMessage });
        setForecastResult((prev) =>
          prev ? { ...prev, status: "failed", error: errorMessage } : null
        );
        setIsRunning(false);
      }
    }
  }, [selectedDataset, selectedEntity, forecastConfig, isBatchMode, allEntities, selectedRegressors]);

  // Render method-specific settings
  const renderMethodSettings = () => {
    switch (forecastConfig.method) {
      case "arima":
        return (
          <ARIMASettings
            settings={forecastConfig.methodSettings}
            onChange={(settings) => handleConfigChange({ methodSettings: settings })}
          />
        );
      case "ets":
        return (
          <ETSSettings
            settings={forecastConfig.methodSettings}
            onChange={(settings) => handleConfigChange({ methodSettings: settings })}
          />
        );
      case "prophet":
        return (
          <ProphetSettings
            settings={forecastConfig.methodSettings}
            onChange={(settings) => handleConfigChange({ methodSettings: settings })}
          />
        );
    }
  };

  const canRunForecast = selectedDataset && selectedEntity && !isRunning;
  const canAutoDetect = selectedDataset && selectedEntity && !isRunning && !isAutoDetecting;
  const hasResults = isBatchMode ? !!batchResult : (forecastResult?.status === "completed");
  const hasAnyResult = isBatchMode ? !!batchResult : !!forecastResult;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Forecast</h1>
          <p className="text-muted-foreground">
            Configure and run time series forecasts using ARIMA, ETS, or Prophet models
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!hasAnyResult}
            onClick={handleReset}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleRunForecast} disabled={!canRunForecast}>
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isRunning ? "Running..." : isBatchMode ? "Forecast All" : "Run Forecast"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel - Configuration */}
        <div className="col-span-4 space-y-4">
          {/* Dataset Selection */}
          <DatasetSelector
            selectedDataset={selectedDataset}
            onSelect={handleDatasetSelect}
            initialDatasetId={datasetIdFromUrl}
          />

          {/* Entity Selection */}
          {selectedDataset && (
            <EntitySelector
              datasetId={selectedDataset.id}
              selectedEntity={selectedEntity}
              onEntityChange={handleEntitySelect}
              onEntitiesLoaded={handleEntitiesLoaded}
            />
          )}

          {/* Method Selection */}
          <MethodSelector
            selectedMethod={forecastConfig.method}
            onSelect={handleMethodSelect}
          />

          {/* Forecast Settings */}
          <ForecastSettings config={forecastConfig} onChange={handleConfigChange} />

          {/* Method-specific Settings with Auto-detect */}
          <div className="space-y-2">
            {renderMethodSettings()}

            {/* Auto-detect Parameters Button */}
            {forecastConfig.method !== "prophet" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!canAutoDetect}
                onClick={handleAutoDetectParams}
              >
                {isAutoDetecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                {isAutoDetecting ? "Detecting..." : "Auto-detect Parameters"}
              </Button>
            )}
          </div>

          {/* Regressor Selection — shown when dataset has extra columns */}
          {selectedDataset && (
            <RegressorSelector
              datasetId={selectedDataset.id}
              selectedRegressors={selectedRegressors}
              onRegressorsChange={setSelectedRegressors}
            />
          )}

          {/* Cross Validation Settings — only for single entity */}
          {!isBatchMode && (
            <CrossValidationSettings
              config={forecastConfig.crossValidation}
              onChange={handleCrossValidationChange}
            />
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="configure">
                <Settings2 className="h-4 w-4 mr-2" />
                Configure
              </TabsTrigger>
              <TabsTrigger value="progress" disabled={!isRunning && !hasAnyResult}>
                Progress
              </TabsTrigger>
              <TabsTrigger
                value="results"
                disabled={!hasResults}
              >
                Results
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configure" className="mt-6">
              <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/30">
                <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Configure Your Forecast</h3>
                <p className="text-muted-foreground max-w-md mt-2">
                  Select a dataset and entity from the left panel, choose a forecasting
                  method, and configure the settings. Then click &quot;Run Forecast&quot; to begin.
                </p>
                {!selectedDataset && (
                  <p className="text-sm text-amber-600 mt-4">
                    Start by selecting a dataset
                  </p>
                )}
                {selectedDataset && !selectedEntity && (
                  <p className="text-sm text-amber-600 mt-4">
                    Now select an entity to forecast
                  </p>
                )}
                {selectedDataset && selectedEntity && (
                  <Button onClick={handleRunForecast} className="mt-6">
                    <Play className="h-4 w-4 mr-2" />
                    {isBatchMode ? "Forecast All Entities" : "Run Forecast"}
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="progress" className="mt-6">
              {isBatchMode ? (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      {isRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : batchResult && batchResult.status !== "running" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : null}
                      <span className="font-medium">
                        {isRunning
                          ? `Forecasting entities...`
                          : batchResult && batchResult.status !== "running"
                          ? `Batch forecast complete`
                          : "Waiting to start..."}
                      </span>
                    </div>
                    {batchResult && (
                      <>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${batchResult.total > 0 ? ((batchResult.completed + batchResult.failed) / batchResult.total) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>{batchResult.completed + batchResult.failed} / {batchResult.total} processed</span>
                          {batchResult.completed > 0 && <span className="text-green-600">{batchResult.completed} completed</span>}
                          {batchResult.failed > 0 && <span className="text-destructive">{batchResult.failed} failed</span>}
                          {batchResult.in_progress > 0 && <span className="text-blue-600">{batchResult.in_progress} remaining</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ForecastProgress
                  isRunning={isRunning}
                  result={forecastResult}
                  onStatusUpdate={handleStatusUpdate}
                />
              )}
            </TabsContent>

            <TabsContent value="results" className="mt-6 space-y-6">
              {isBatchMode && batchResult ? (
                <BatchForecastResults batchResult={batchResult} />
              ) : forecastResult && forecastResult.status === "completed" ? (
                <ForecastResults result={forecastResult} />
              ) : null}

              {/* Navigation buttons — show when any result is available */}
              {(forecastResult?.status === "completed" || (batchResult && batchResult.completed > 0)) && (
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const fid = forecastResult?.id ?? batchResult?.results?.find((r: ForecastResult) => r.status === "completed")?.id;
                      router.push(`/${tenant}/results${fid ? `?forecastId=${fid}` : ""}`);
                    }}
                  >
                    <LineChart className="h-4 w-4 mr-2" />
                    View Results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const fid = forecastResult?.id ?? batchResult?.results?.find((r: ForecastResult) => r.status === "completed")?.id;
                      router.push(`/${tenant}/diagnostics${fid ? `?forecastId=${fid}` : ""}`);
                    }}
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    View Diagnostics
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
