"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProphetSettingsType {
  changepoint_prior_scale?: number;
  seasonality_prior_scale?: number;
  seasonality_mode?: string;
  yearly_seasonality?: boolean;
  weekly_seasonality?: boolean;
  daily_seasonality?: boolean;
}

interface ProphetSettingsProps {
  settings: ProphetSettingsType;
  onChange: (settings: ProphetSettingsType) => void;
}

export function ProphetSettings({ settings, onChange }: ProphetSettingsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prophet Settings</CardTitle>
        <CardDescription>Configure Facebook Prophet parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Changepoint Prior Scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Trend Flexibility</Label>
            <span className="text-xs font-medium">
              {settings.changepoint_prior_scale?.toFixed(2) ?? "0.05"}
            </span>
          </div>
          <Slider
            value={[(settings.changepoint_prior_scale ?? 0.05) * 100]}
            min={1}
            max={50}
            step={1}
            onValueChange={([value]) =>
              onChange({ ...settings, changepoint_prior_scale: value / 100 })
            }
            className="py-1"
          />
          <p className="text-xs text-muted-foreground">
            Higher values allow more trend changes
          </p>
        </div>

        {/* Seasonality Mode */}
        <div className="space-y-1.5">
          <Label className="text-xs">Seasonality Mode</Label>
          <Select
            value={settings.seasonality_mode || "additive"}
            onValueChange={(value) => onChange({ ...settings, seasonality_mode: value })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="additive">Additive</SelectItem>
              <SelectItem value="multiplicative">Multiplicative</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Multiplicative for seasonality that scales with the level
          </p>
        </div>

        {/* Seasonality Toggles */}
        <div className="space-y-3 pt-2">
          <Label className="text-xs font-medium">Seasonality Components</Label>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Yearly Seasonality</Label>
            <Switch
              checked={settings.yearly_seasonality ?? true}
              onCheckedChange={(checked) =>
                onChange({ ...settings, yearly_seasonality: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Weekly Seasonality</Label>
            <Switch
              checked={settings.weekly_seasonality ?? true}
              onCheckedChange={(checked) =>
                onChange({ ...settings, weekly_seasonality: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Daily Seasonality</Label>
            <Switch
              checked={settings.daily_seasonality ?? false}
              onCheckedChange={(checked) =>
                onChange({ ...settings, daily_seasonality: checked })
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
