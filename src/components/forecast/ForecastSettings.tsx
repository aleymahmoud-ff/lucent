"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

interface ForecastConfig {
  method: "arima" | "ets" | "prophet";
  horizon: number;
  frequency: "daily" | "weekly" | "monthly";
  confidenceLevel: number;
  methodSettings: Record<string, unknown>;
}

interface ForecastSettingsProps {
  config: ForecastConfig;
  onChange: (config: Partial<ForecastConfig>) => void;
}

export function ForecastSettings({ config, onChange }: ForecastSettingsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Forecast Settings</CardTitle>
        <CardDescription>Configure horizon, frequency, and confidence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Horizon */}
        <div className="space-y-2">
          <Label htmlFor="horizon" className="text-sm">Forecast Horizon</Label>
          <Input
            id="horizon"
            type="number"
            min={1}
            max={365}
            value={config.horizon}
            onChange={(e) => onChange({ horizon: parseInt(e.target.value) || 30 })}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Number of periods to forecast (1-365)
          </p>
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <Label className="text-sm">Data Frequency</Label>
          <Select
            value={config.frequency}
            onValueChange={(value: "daily" | "weekly" | "monthly") => onChange({ frequency: value })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Confidence Level */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Confidence Level</Label>
            <span className="text-sm font-medium">{Math.round(config.confidenceLevel * 100)}%</span>
          </div>
          <Slider
            value={[config.confidenceLevel * 100]}
            min={80}
            max={99}
            step={1}
            onValueChange={([value]) => onChange({ confidenceLevel: value / 100 })}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            Width of prediction intervals
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
