"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CrossValidationConfig {
  enabled: boolean;
  folds: number;
  method: "rolling" | "expanding";
  initialTrainSize?: number;
}

interface CrossValidationSettingsProps {
  config: CrossValidationConfig;
  onChange: (config: CrossValidationConfig) => void;
}

export function CrossValidationSettings({
  config,
  onChange,
}: CrossValidationSettingsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cross Validation</CardTitle>
        <CardDescription>
          Evaluate forecast accuracy with time-series cross validation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Enable Cross Validation</Label>
            <p className="text-xs text-muted-foreground">
              Assess model performance before final forecast
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => onChange({ ...config, enabled: checked })}
          />
        </div>

        {config.enabled && (
          <div className="space-y-4 pt-4 border-t">
            {/* Folds */}
            <div className="space-y-1.5">
              <Label htmlFor="cv-folds" className="text-xs">
                Number of Folds
              </Label>
              <Input
                id="cv-folds"
                type="number"
                min={2}
                max={10}
                value={config.folds}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    onChange({ ...config, folds: Math.min(10, Math.max(2, value)) });
                  }
                }}
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Number of validation windows (2–10)
              </p>
            </div>

            {/* CV Method */}
            <div className="space-y-1.5">
              <Label className="text-xs">Validation Method</Label>
              <Select
                value={config.method}
                onValueChange={(value: "rolling" | "expanding") =>
                  onChange({ ...config, method: value })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rolling">
                    Rolling Window
                  </SelectItem>
                  <SelectItem value="expanding">
                    Expanding Window
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.method === "rolling"
                  ? "Fixed-size training window slides forward"
                  : "Training window grows with each fold"}
              </p>
            </div>

            {/* Initial Train Size */}
            <div className="space-y-1.5">
              <Label htmlFor="cv-train-size" className="text-xs">
                Initial Train Size (%)
              </Label>
              <Input
                id="cv-train-size"
                type="number"
                min={50}
                max={90}
                value={config.initialTrainSize ?? 70}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    onChange({
                      ...config,
                      initialTrainSize: Math.min(90, Math.max(50, value)),
                    });
                  }
                }}
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Percentage of data used for the initial training set (50–90%)
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
