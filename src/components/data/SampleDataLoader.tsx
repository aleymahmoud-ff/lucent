"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Database, BarChart, Zap, TrendingUp, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

interface SampleDataLoaderProps {
  onLoadComplete: (data: SampleResult) => void;
  onLoadError?: (error: string) => void;
}

interface SampleResult {
  id: string;
  name: string;
  filename: string;
  row_count: number;
  column_count: number;
  entities: string[];
}

interface SampleOption {
  type: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const sampleOptions: SampleOption[] = [
  {
    type: "default",
    name: "General Forecast",
    description: "Basic time series data with trend and seasonality",
    icon: Database,
    color: "text-blue-600",
  },
  {
    type: "sales",
    name: "Sales Data",
    description: "Product sales with multiple entities",
    icon: BarChart,
    color: "text-green-600",
  },
  {
    type: "energy",
    name: "Energy Consumption",
    description: "Hourly energy usage data",
    icon: Zap,
    color: "text-yellow-600",
  },
  {
    type: "stock",
    name: "Stock Prices",
    description: "Daily stock price data",
    icon: TrendingUp,
    color: "text-purple-600",
  },
];

export function SampleDataLoader({ onLoadComplete, onLoadError }: SampleDataLoaderProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const handleLoadSample = async (sampleType: string) => {
    setLoading(sampleType);

    try {
      const result = await api.post<SampleResult>("/datasets/sample", {
        sample_type: sampleType,
      });
      setOpen(false);
      onLoadComplete(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load sample data";
      onLoadError?.(errorMessage);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Database className="h-4 w-4 mr-2" />
          Load Sample Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Load Sample Data</DialogTitle>
          <DialogDescription>
            Choose a sample dataset to explore LUCENT's features without uploading your own data.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {sampleOptions.map((option) => {
            const Icon = option.icon;
            const isLoading = loading === option.type;

            return (
              <Card
                key={option.type}
                className={`cursor-pointer transition-colors hover:bg-accent ${
                  isLoading ? "opacity-70" : ""
                }`}
                onClick={() => !loading && handleLoadSample(option.type)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`rounded-lg p-2 bg-muted`}>
                    {isLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Icon className={`h-6 w-6 ${option.color}`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{option.name}</p>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
