"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface ETSSettingsType {
  auto?: boolean;
  error?: string;
  trend?: string;
  seasonal?: string;
  seasonal_periods?: number;
  damped_trend?: boolean;
}

interface ETSSettingsProps {
  settings: ETSSettingsType;
  onChange: (settings: ETSSettingsType) => void;
}

export function ETSSettings({ settings, onChange }: ETSSettingsProps) {
  const isAuto = settings.auto ?? true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ETS Settings</CardTitle>
        <CardDescription>Configure Exponential Smoothing parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Auto-detect Parameters</Label>
            <p className="text-xs text-muted-foreground">
              Find optimal ETS configuration automatically
            </p>
          </div>
          <Switch
            checked={isAuto}
            onCheckedChange={(checked) => onChange({ ...settings, auto: checked })}
          />
        </div>

        {/* Manual Parameters */}
        {!isAuto && (
          <div className="space-y-4 pt-4 border-t">
            {/* Error Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Error Type</Label>
              <Select
                value={settings.error || "add"}
                onValueChange={(value) => onChange({ ...settings, error: value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Additive</SelectItem>
                  <SelectItem value="mul">Multiplicative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trend */}
            <div className="space-y-1.5">
              <Label className="text-xs">Trend</Label>
              <Select
                value={settings.trend || "none"}
                onValueChange={(value) => onChange({ ...settings, trend: value === "none" ? undefined : value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="add">Additive</SelectItem>
                  <SelectItem value="mul">Multiplicative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seasonal */}
            <div className="space-y-1.5">
              <Label className="text-xs">Seasonality</Label>
              <Select
                value={settings.seasonal || "none"}
                onValueChange={(value) => onChange({ ...settings, seasonal: value === "none" ? undefined : value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="add">Additive</SelectItem>
                  <SelectItem value="mul">Multiplicative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seasonal Periods */}
            {settings.seasonal && settings.seasonal !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Seasonal Period</Label>
                <Input
                  type="number"
                  min={2}
                  value={settings.seasonal_periods ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      seasonal_periods: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  placeholder="e.g., 7 for weekly, 12 for yearly"
                  className="h-8"
                />
              </div>
            )}

            {/* Damped Trend */}
            {settings.trend && settings.trend !== "none" && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Damped Trend</Label>
                  <p className="text-xs text-muted-foreground">
                    Trend fades over time
                  </p>
                </div>
                <Switch
                  checked={settings.damped_trend ?? false}
                  onCheckedChange={(checked) => onChange({ ...settings, damped_trend: checked })}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
