"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

import {
  DatasetSelector,
  EntitySelector,
  MethodSelector,
  ForecastSettings,
  ARIMASettings,
  ETSSettings,
  ProphetSettings,
  ForecastProgress,
  ForecastResults,
} from "@/components/forecast";

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

interface ForecastConfig {
  method: "arima" | "ets" | "prophet";
  horizon: number;
  frequency: "daily" | "weekly" | "monthly";
  confidenceLevel: number;
  methodSettings: MethodSettings;
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
  };
  created_at: string;
  completed_at?: string;
  error?: string;
}

const defaultConfig: ForecastConfig = {
  method: "arima",
  horizon: 30,
  frequency: "daily",
  confidenceLevel: 0.95,
  methodSettings: { auto: true },
};

export default function ForecastPage() {
  const searchParams = useSearchParams();
  const datasetIdFromUrl = searchParams.get("dataset");

  // State
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [forecastConfig, setForecastConfig] = useState<ForecastConfig>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [activeTab, setActiveTab] = useState("configure");

  // Handlers
  const handleDatasetSelect = useCallback((dataset: Dataset | null) => {
    setSelectedDataset(dataset);
    setSelectedEntity(null);
    setForecastResult(null);
  }, []);

  const handleEntitySelect = useCallback((entityId: string | null) => {
    setSelectedEntity(entityId);
    setForecastResult(null);
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

  const handleReset = useCallback(() => {
    setForecastResult(null);
    setActiveTab("configure");
  }, []);

  const handleRunForecast = useCallback(async () => {
    if (!selectedDataset || !selectedEntity) {
      toast.error("Please select a dataset and entity first");
      return;
    }

    setIsRunning(true);
    setActiveTab("progress");
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

    try {
      // Build request payload
      const frequencyMap = { daily: "D", weekly: "W", monthly: "M" };
      const payload: Record<string, unknown> = {
        dataset_id: selectedDataset.id,
        entity_id: selectedEntity,
        method: forecastConfig.method,
        horizon: forecastConfig.horizon,
        frequency: frequencyMap[forecastConfig.frequency],
        confidence_level: forecastConfig.confidenceLevel,
      };

      // Add method-specific settings
      if (forecastConfig.method === "arima") {
        payload.arima_settings = forecastConfig.methodSettings;
      } else if (forecastConfig.method === "ets") {
        payload.ets_settings = forecastConfig.methodSettings;
      } else {
        payload.prophet_settings = forecastConfig.methodSettings;
      }

      const result = await api.post<ForecastResult>("/forecast/run", payload);

      setForecastResult(result);

      if (result.status === "completed") {
        setActiveTab("results");
        toast.success("Forecast completed successfully!", {
          description: `${result.predictions.length} periods forecasted using ${result.model_summary.method}`,
        });
      } else if (result.status === "failed") {
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
    } finally {
      setIsRunning(false);
    }
  }, [selectedDataset, selectedEntity, forecastConfig]);

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Forecast</h1>
          <p className="text-muted-foreground">
            Configure and run time series forecasts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!forecastResult}
            onClick={handleReset}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleRunForecast} disabled={!canRunForecast}>
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? "Running..." : "Run Forecast"}
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
            />
          )}

          {/* Method Selection */}
          <MethodSelector
            selectedMethod={forecastConfig.method}
            onSelect={handleMethodSelect}
          />

          {/* Forecast Settings */}
          <ForecastSettings config={forecastConfig} onChange={handleConfigChange} />

          {/* Method-specific Settings */}
          {renderMethodSettings()}
        </div>

        {/* Right Panel - Results */}
        <div className="col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="configure">
                <Settings2 className="h-4 w-4 mr-2" />
                Configure
              </TabsTrigger>
              <TabsTrigger value="progress" disabled={!isRunning && !forecastResult}>
                Progress
              </TabsTrigger>
              <TabsTrigger
                value="results"
                disabled={!forecastResult || forecastResult.status !== "completed"}
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
                  method, and configure the settings. Then click "Run Forecast" to begin.
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
                    Run Forecast
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="progress" className="mt-6">
              <ForecastProgress isRunning={isRunning} result={forecastResult} />
            </TabsContent>

            <TabsContent value="results" className="mt-6">
              {forecastResult && forecastResult.status === "completed" && (
                <ForecastResults result={forecastResult} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
