"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Database } from "lucide-react";
import { api } from "@/lib/api/client";

interface Dataset {
  id: string;
  name: string;
  filename: string;
  row_count: number;
  column_count: number;
  entities?: string[];
  date_range?: { start: string; end: string };
}

interface DatasetSelectorProps {
  selectedDataset: Dataset | null;
  onSelect: (dataset: Dataset | null) => void;
  initialDatasetId?: string | null;
}

export function DatasetSelector({ selectedDataset, onSelect, initialDatasetId }: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useEffect(() => {
    fetchDatasets();
  }, []);

  // Auto-select dataset from initialDatasetId after datasets are loaded
  useEffect(() => {
    if (initialDatasetId && datasets.length > 0 && !selectedDataset && !hasAutoSelected) {
      const dataset = datasets.find((d) => d.id === initialDatasetId);
      if (dataset) {
        onSelect(dataset);
        setHasAutoSelected(true);
      }
    }
  }, [initialDatasetId, datasets, selectedDataset, hasAutoSelected, onSelect]);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ datasets: Dataset[]; total: number }>("/datasets");
      setDatasets(response.datasets || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (datasetId: string) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    onSelect(dataset || null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          Dataset
        </CardTitle>
        <CardDescription>Select a dataset to forecast</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading datasets...</span>
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-2">{error}</div>
        ) : datasets.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No datasets available. Upload data first.
          </div>
        ) : (
          <Select
            value={selectedDataset?.id || ""}
            onValueChange={handleSelect}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  <div className="flex flex-col">
                    <span>{dataset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {dataset.row_count.toLocaleString()} rows
                      {dataset.entities && ` • ${dataset.entities.length} entities`}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedDataset && (
          <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rows:</span>
              <span className="font-medium">{selectedDataset.row_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Columns:</span>
              <span className="font-medium">{selectedDataset.column_count}</span>
            </div>
            {selectedDataset.date_range && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date Range:</span>
                <span className="font-medium">
                  {selectedDataset.date_range.start} to {selectedDataset.date_range.end}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
